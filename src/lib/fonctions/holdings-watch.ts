// Tool: the rug watch. Looks at every token the wallet holds and says what changed since the last
// look: the creator sold, the liquidity left, the holders got concentrated, the price fell off a
// cliff. A token seen for the first time (an airdrop, a new buy) gets the full check once.
// The app stores `state` between runs (one row per user and wallet); the scheduler calls
// `watchHoldings` and sends the message only when `alert` is true.
import { type Authorities, type Signal, assess } from './check-token';
import {
  type Env,
  MINTS,
  type TokenInfo,
  rpc,
  short,
  tokenInfo,
  usd,
} from './lib';
import { DUST_USD, snapshot } from './wallet-digest';

/** What we remember of a token between two looks. */
export interface Seen {
  symbol: string;
  mintAuthority: boolean;
  freezeAuthority: boolean;
  devPct?: number;
  topPct?: number;
  liquidity?: number;
  price?: number;
}

export interface WatchState {
  wallet: string;
  at: string;
  tokens: Record<string, Seen>;
}

export interface WatchAlert {
  mint: string;
  symbol: string;
  level: 'warn' | 'risk';
  key: string;
  text: string;
}

export interface WatchResult {
  /** True when there is something to tell: send `message` then, stay quiet otherwise. */
  alert: boolean;
  alerts: WatchAlert[];
  message: string;
  /** Tokens looked at, and tokens left out (SOL, stablecoins, dust never seen before). */
  checked: number;
  /** Store it and pass it back next run. */
  state: WatchState;
  /** Every signal of the tokens looked at for the first time (all of them without `previous`): the rug check card counts them. */
  assessed: Record<string, { symbol: string; signals: Signal[] }>;
}

// Thresholds: one place, so the review can tune them.
export const WATCH = {
  /** The creator's share fell by at least this many points of the supply. */
  devSoldPoints: 2,
  /** ...or the creator sold at least this share of what they held, from at least `devFloor` points. */
  devSoldShare: 0.8,
  devFloor: 0.5,
  /** Liquidity lost at least this fraction, from at least `liquidityFloor`. */
  liquidityDrop: 0.5,
  liquidityFloor: 1_000,
  /** The top holders' share rose by at least this many points. */
  concentrationPoints: 10,
  /** The price lost at least this fraction since the last look. */
  priceDrop: 0.5,
  /** Most tokens looked at in one run (one Jupiter call per 100, one RPC call). */
  maxTokens: 50,
};

const SKIP = new Set<string>([MINTS.SOL, MINTS.USDC, MINTS.USDT]);

interface ParsedAccounts {
  value: ({ data: { parsed?: { type: string; info: Authorities } } } | null)[];
}

/** Mint and freeze authorities read from the chain, for up to 100 mints in one call. */
async function authorities(
  env: Env,
  mints: string[],
): Promise<Record<string, Authorities>> {
  const out: Record<string, Authorities> = {};
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const res = await rpc<ParsedAccounts>(env, 'getMultipleAccounts', [
      chunk,
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    res.value.forEach((a, k) => {
      const p = a?.data.parsed;
      if (p?.type === 'mint') out[chunk[k]] = p.info;
    });
  }
  return out;
}

const pts = (n: number) => `${n < 0.1 ? '<0.1' : n.toFixed(1)}%`;

/** What changed between two looks at one token. Pure, so the thresholds are tested on their own. */
export function changes(mint: string, before: Seen, now: Seen): WatchAlert[] {
  const out: WatchAlert[] = [];
  const add = (level: WatchAlert['level'], key: string, text: string) =>
    out.push({ mint, symbol: now.symbol, level, key, text });
  // Revoking an authority is final on Solana; one that shows up again means the mint was not what we read.
  if (now.mintAuthority && !before.mintAuthority)
    add('risk', 'mint', 'Someone can mint this token again.');
  if (now.freezeAuthority && !before.freezeAuthority)
    add('risk', 'freeze', 'Someone can freeze holders of this token again.');
  if (
    before.devPct !== undefined &&
    now.devPct !== undefined &&
    (before.devPct - now.devPct >= WATCH.devSoldPoints ||
      (before.devPct >= WATCH.devFloor &&
        (before.devPct - now.devPct) / before.devPct >= WATCH.devSoldShare))
  )
    add(
      'risk',
      'dev',
      `The creator's wallet sold: it held ${pts(before.devPct)} of the supply, now ${pts(now.devPct)}.`,
    );
  if (
    before.liquidity !== undefined &&
    before.liquidity >= WATCH.liquidityFloor &&
    (now.liquidity ?? 0) <= before.liquidity * (1 - WATCH.liquidityDrop)
  )
    add(
      'risk',
      'liquidity',
      `Liquidity fell from ${usd(before.liquidity)} to ${usd(now.liquidity ?? 0)}: selling may now move the price a lot.`,
    );
  if (
    before.topPct !== undefined &&
    now.topPct !== undefined &&
    now.topPct - before.topPct >= WATCH.concentrationPoints
  )
    add(
      'warn',
      'holders',
      `The top holders now own ${pts(now.topPct)} of the supply, up from ${pts(before.topPct)}.`,
    );
  if (
    before.price &&
    now.price !== undefined &&
    now.price <= before.price * (1 - WATCH.priceDrop)
  )
    add(
      'risk',
      'price',
      `Its price fell ${Math.round((1 - now.price / before.price) * 100)}% since the last look (${usd(before.price)} to ${usd(now.price)}).`,
    );
  return out;
}

/** First look at a token: its red flags only. "To watch" signals would make every run noisy. */
export function firstLook(
  mint: string,
  symbol: string,
  signals: Signal[],
): WatchAlert[] {
  return signals
    .filter((s) => s.level === 'risk')
    .map((s) => ({
      mint,
      symbol,
      level: 'risk' as const,
      key: s.key,
      text: s.text,
    }));
}

export async function watchHoldings(
  env: Env,
  wallet: string,
  previous?: WatchState,
  now = Date.now(),
): Promise<WatchResult> {
  const snap = await snapshot(env, wallet, new Date(now));
  const before = previous?.wallet === wallet ? previous.tokens : {};
  // Held now and worth watching: not SOL or a stablecoin, not dust unless we already knew it
  // (a token that crashed to dust is exactly what this is for).
  const held = snap.holdings
    .filter(
      (h) =>
        !SKIP.has(h.mint) && ((h.usd ?? 0) >= DUST_USD || h.mint in before),
    )
    .slice(0, WATCH.maxTokens);
  const mints = held.map((h) => h.mint);
  const [auth, info]: [Record<string, Authorities>, Record<string, TokenInfo>] =
    mints.length
      ? await Promise.all([authorities(env, mints), tokenInfo(env, mints)])
      : [{}, {}];

  const alerts: WatchAlert[] = [];
  const tokens: Record<string, Seen> = {};
  const assessed: WatchResult['assessed'] = {};
  for (const h of held) {
    const a = auth[h.mint];
    if (!a) continue; // not a mint we could read: skip rather than guess
    const t: TokenInfo = info[h.mint] ?? {
      id: h.mint,
      name: h.symbol,
      symbol: h.symbol,
      decimals: 0,
    };
    const seen: Seen = {
      symbol: t.symbol || h.symbol,
      mintAuthority: !!a.mintAuthority,
      freezeAuthority: !!a.freezeAuthority,
      devPct: t.audit?.devBalancePercentage,
      topPct: t.audit?.topHoldersPercentage,
      liquidity: t.liquidity,
      price:
        h.amount > 0 && h.usd !== undefined ? h.usd / h.amount : t.usdPrice,
    };
    tokens[h.mint] = seen;
    if (before[h.mint]) alerts.push(...changes(h.mint, before[h.mint], seen));
    else {
      const signals = assess(t, a, now);
      assessed[h.mint] = { symbol: seen.symbol, signals };
      alerts.push(...firstLook(h.mint, seen.symbol, signals));
    }
  }

  const head = `Rug watch on ${short(wallet)}`;
  const firstRun = !previous;
  const lines = alerts.length
    ? [
        `${head}: ${alerts.length} alert${alerts.length > 1 ? 's' : ''} on ${new Set(alerts.map((a) => a.mint)).size} of ${held.length} tokens.`,
        ...alerts.map((a) => `• ${a.symbol}: ${a.text}`),
      ]
    : [
        `${head}: ${firstRun ? 'no red flag' : 'nothing new'} on ${held.length} token${held.length === 1 ? '' : 's'}${firstRun ? '. Watching from now on' : ''}.`,
      ];
  lines.push('Signals, not a guarantee. Information, not financial advice.');
  return {
    alert: alerts.length > 0,
    alerts,
    message: lines.join('\n'),
    checked: held.length,
    state: { wallet, at: new Date(now).toISOString(), tokens },
    assessed,
  };
}
