// Tool: the morning wallet digest. Takes a snapshot of a wallet (SOL + every token, priced),
// compares it to yesterday's, and writes the Telegram message. The app stores the snapshot
// between runs (one JSON per automation) and its scheduler calls `digest` once a day.
import {
  type Env,
  MINTS,
  TOKEN_PROGRAMS,
  ToolError,
  amount,
  isAddress,
  prices,
  rpc,
  short,
  tokenInfo,
  usd,
} from './lib';

export interface Holding {
  mint: string;
  symbol: string;
  amount: number;
  usd?: number;
  /** Value 24 h ago at today's amount, from the 24 h price change. */ usd24h?: number;
}
export interface Snapshot {
  wallet: string;
  at: string;
  holdings: Holding[];
  totalUsd: number;
}

interface TokenAccounts {
  value: {
    account: {
      data: {
        parsed: {
          info: { mint: string; tokenAmount: { uiAmount: number | null } };
        };
      };
    };
  }[];
}

/** Holdings worth less than this are left out of the message (dust, spam airdrops). */
export const DUST_USD = 1;

export async function snapshot(
  env: Env,
  wallet: string,
  now = new Date(),
): Promise<Snapshot> {
  if (!isAddress(wallet))
    throw new ToolError('That is not a Solana wallet address.');
  const [lamports, ...accounts] = await Promise.all([
    rpc<{ value: number }>(env, 'getBalance', [
      wallet,
      { commitment: 'confirmed' },
    ]),
    ...TOKEN_PROGRAMS.map((programId) =>
      rpc<TokenAccounts>(env, 'getTokenAccountsByOwner', [
        wallet,
        { programId },
        { encoding: 'jsonParsed', commitment: 'confirmed' },
      ]),
    ),
  ]);
  const amounts = new Map<string, number>();
  amounts.set(MINTS.SOL, lamports.value / 1e9);
  for (const res of accounts as TokenAccounts[])
    for (const a of res.value) {
      const { mint, tokenAmount } = a.account.data.parsed.info;
      const n = tokenAmount.uiAmount ?? 0;
      if (n > 0) amounts.set(mint, (amounts.get(mint) ?? 0) + n);
    }
  const mints = [...amounts.keys()];
  const [p, meta] = await Promise.all([
    prices(env, mints),
    tokenInfo(env, mints),
  ]);
  const holdings: Holding[] = mints
    .map((mint) => {
      const n = amounts.get(mint)!;
      const price = p[mint];
      const value = price === undefined ? undefined : n * price;
      const pc = meta[mint]?.stats24h?.priceChange;
      const usd24h =
        value !== undefined && typeof pc === 'number'
          ? value / (1 + pc / 100)
          : undefined;
      return {
        mint,
        symbol:
          mint === MINTS.SOL ? 'SOL' : (meta[mint]?.symbol ?? short(mint)),
        amount: n,
        usd: value,
        usd24h,
      };
    })
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  const totalUsd = holdings.reduce((s, h) => s + (h.usd ?? 0), 0);
  return { wallet, at: now.toISOString(), holdings, totalUsd };
}

/** "+$12.50" or "−$12.50": a real minus sign, never a hyphen. */
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`;
/** "+4.2%" or "−27.9%". */
const share = (n: number, of: number) =>
  `${n >= 0 ? '+' : '−'}${Math.abs((n / of) * 100).toFixed(1)}%`;

export interface Digest {
  message: string;
  snapshot: Snapshot;
}

/** Today's snapshot, compared to `previous` when there is one. Store `snapshot` for tomorrow. */
export async function digest(
  env: Env,
  wallet: string,
  previous?: Snapshot,
): Promise<Digest> {
  const snap = await snapshot(env, wallet);
  const lines: string[] = [
    `Your wallet ${short(wallet)} this morning: ${usd(snap.totalUsd)}.`,
  ];
  const priced = snap.holdings.filter(
    (h) => h.usd !== undefined && h.usd24h !== undefined,
  );
  if (!previous && priced.length) {
    const now = priced.reduce((s, h) => s + h.usd!, 0),
      then = priced.reduce((s, h) => s + h.usd24h!, 0);
    const diff = now - then;
    lines.push(
      `Price moves over 24 h on what you hold now: ${signed(diff)}${then > 0 ? ` (${share(diff, then)})` : ''}.`,
    );
  }
  if (previous) {
    const diff = snap.totalUsd - previous.totalUsd;
    lines.push(
      `Since yesterday: ${signed(diff)}${previous.totalUsd > 0 ? ` (${share(diff, previous.totalUsd)})` : ''}.`,
    );
    const before = new Map(previous.holdings.map((h) => [h.mint, h]));
    const moved: string[] = [];
    for (const h of snap.holdings) {
      const b = before.get(h.mint);
      if (!b) {
        if ((h.usd ?? 0) >= DUST_USD)
          moved.push(`new: ${amount(h.amount)} ${h.symbol}`);
        continue;
      }
      const d = h.amount - b.amount;
      if (Math.abs(d) > 1e-9 && Math.abs(d) / Math.max(b.amount, 1e-9) > 0.001)
        moved.push(`${h.symbol} ${d > 0 ? '+' : '−'}${amount(Math.abs(d))}`);
    }
    for (const b of previous.holdings)
      if (
        !snap.holdings.some((h) => h.mint === b.mint) &&
        (b.usd ?? 0) >= DUST_USD
      )
        moved.push(`gone: ${b.symbol}`);
    lines.push(
      moved.length
        ? `Moves: ${moved.join(', ')}.`
        : 'No tokens moved in or out.',
    );
  }
  const top = snap.holdings.filter((h) => (h.usd ?? 0) >= DUST_USD).slice(0, 5);
  if (top.length)
    lines.push(
      ...top.map((h) => `• ${amount(h.amount)} ${h.symbol} · ${usd(h.usd!)}`),
    );
  lines.push('Information, not financial advice.');
  return { message: lines.join('\n'), snapshot: snap };
}
