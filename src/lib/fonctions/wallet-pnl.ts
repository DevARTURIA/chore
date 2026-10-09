// The PnL behind the share cards: what a wallet's trades made over a period, or on one token.
// Everything comes from the wallet's own transactions on Solana: what left and what came in, in
// SOL (exact) and in stablecoins. SOL legs are shown in dollars at today's SOL price; the proof
// page says so and lists every transaction used, each one checkable on Solscan.
import {
  type Env,
  MINTS,
  ToolError,
  isAddress,
  prices,
  rpc,
  short,
  tokenInfo,
} from './lib';

const LAMPORTS = 1e9;
const STABLES = new Set<string>([MINTS.USDC, MINTS.USDT]);

/** One swap of the wallet, reduced to what the PnL needs. */
export interface Trade {
  signature: string;
  time: number;
  mint: string;
  side: 'buy' | 'sell';
  /** Tokens bought or sold (whole tokens). */
  qty: number;
  /** What was paid or received, in SOL (fees included) and in stablecoins. */
  sol: number;
  usd: number;
}

interface TokenBalance {
  mint: string;
  owner?: string;
  uiTokenAmount: { uiAmount: number | null };
}
interface RawTx {
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
  transaction: { message: { accountKeys: { pubkey: string }[] } };
}

/** The wallet's side of one transaction: a swap between SOL or a stablecoin and one token, or nothing. */
export function tradeOf(
  signature: string,
  tx: RawTx,
  wallet: string,
): Trade | undefined {
  if (!tx.meta || tx.meta.err || !tx.blockTime) return undefined;
  const i = tx.transaction.message.accountKeys.findIndex(
    (k) => k.pubkey === wallet,
  );
  if (i < 0) return undefined;
  const delta = new Map<string, number>();
  const add = (list: TokenBalance[] | undefined, sign: number) => {
    for (const b of list ?? [])
      if (b.owner === wallet)
        delta.set(
          b.mint,
          (delta.get(b.mint) ?? 0) + sign * (b.uiTokenAmount.uiAmount ?? 0),
        );
  };
  add(tx.meta.preTokenBalances, -1);
  add(tx.meta.postTokenBalances, 1);
  // Native SOL moved by the wallet, fee included, merged with wrapped SOL.
  const sol =
    (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / LAMPORTS +
    (delta.get(MINTS.SOL) ?? 0);
  delta.delete(MINTS.SOL);
  let usd = 0;
  for (const m of STABLES) {
    usd += delta.get(m) ?? 0;
    delta.delete(m);
  }
  const tokens = [...delta].filter(([, d]) => Math.abs(d) > 0);
  if (tokens.length !== 1) return undefined; // not a plain trade of one token (transfer, LP, multi-hop leftovers)
  const [mint, qty] = tokens[0];
  // A buy pays with SOL or a stablecoin; a sell receives them. Anything else is not a trade.
  if (qty > 0 && (sol < 0 || usd < 0))
    return {
      signature,
      time: tx.blockTime * 1000,
      mint,
      side: 'buy',
      qty,
      sol: Math.max(0, -sol),
      usd: Math.max(0, -usd),
    };
  if (qty < 0 && (sol > 0 || usd > 0))
    return {
      signature,
      time: tx.blockTime * 1000,
      mint,
      side: 'sell',
      qty: -qty,
      sol: Math.max(0, sol),
      usd: Math.max(0, usd),
    };
  return undefined;
}

export interface HistoryOptions {
  /** Oldest time to read (ms). */
  since: number;
  /** Most signatures read; past it the period is cut and `complete` is false. */
  cap?: number;
  concurrency?: number;
}

/** The wallet's trades since a date, newest first. */
export async function history(
  env: Env,
  wallet: string,
  o: HistoryOptions,
): Promise<{ trades: Trade[]; read: number; complete: boolean }> {
  if (!isAddress(wallet))
    throw new ToolError('That is not a Solana wallet address.');
  const cap = o.cap ?? 400;
  const sigs: string[] = [];
  let before: string | undefined;
  let complete = true;
  for (;;) {
    const page = await rpc<
      { signature: string; blockTime: number | null; err: unknown }[]
    >(env, 'getSignaturesForAddress', [
      wallet,
      { limit: 1000, ...(before ? { before } : {}), commitment: 'confirmed' },
    ]);
    for (const s of page) {
      if (s.blockTime && s.blockTime * 1000 < o.since) return finish();
      if (!s.err) sigs.push(s.signature);
      if (sigs.length >= cap) {
        complete = false;
        return finish();
      }
    }
    if (page.length < 1000) return finish();
    before = page[page.length - 1].signature;
  }
  async function finish() {
    const trades: Trade[] = [];
    let next = 0;
    const worker = async () => {
      while (next < sigs.length) {
        const sig = sigs[next++];
        const tx = await rpc<RawTx | null>(env, 'getTransaction', [
          sig,
          {
            encoding: 'jsonParsed',
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          },
        ]);
        const t = tx && tradeOf(sig, tx, wallet);
        if (t) trades.push(t);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(o.concurrency ?? 6, sigs.length) }, worker),
    );
    trades.sort((a, b) => b.time - a.time);
    return { trades, read: sigs.length, complete };
  }
}

export interface TokenPnl {
  mint: string;
  symbol: string;
  buys: number;
  sells: number;
  invested: number;
  sold: number;
  /** Value now of what is still held from these buys. */
  holding: number;
  realized: number;
  unrealized: number;
  pnl: number;
  pct: number;
  firstBuy: number;
}

export interface Pnl {
  wallet: string;
  since: number;
  at: number;
  solUsd: number;
  tokens: TokenPnl[];
  invested: number;
  realized: number;
  unrealized: number;
  pnl: number;
  pct: number;
  /** The same PnL in SOL: exact for SOL trades, the figure the dollars come from. */
  pnlSol: number;
  winners: number;
  trades: number;
  /** Tokens sold in the period but bought before it: their cost is unknown, so they are left out. */
  skipped: number;
  /** False when the history was cut by the cap: the card says "last N trades". */
  complete: boolean;
  /** The trades behind the numbers, newest first: the proof page lists them. */
  ledger: Trade[];
}

/** Pure: trades + what is held now + prices now → the PnL. Dollars = SOL × today's SOL price + stablecoins. */
export function summarize(
  wallet: string,
  trades: Trade[],
  held: Record<string, number>,
  price: Record<string, number>,
  symbols: Record<string, string>,
  solUsd: number,
  since: number,
  at: number,
  complete = true,
): Pnl {
  const by = new Map<string, Trade[]>();
  for (const t of trades)
    (by.get(t.mint) ?? by.set(t.mint, []).get(t.mint)!).push(t);
  const tokens: TokenPnl[] = [];
  let skipped = 0;
  for (const [mint, ts] of by) {
    const buys = ts.filter((t) => t.side === 'buy'),
      sells = ts.filter((t) => t.side === 'sell');
    const bought = buys.reduce((s, t) => s + t.qty, 0);
    if (!bought) {
      skipped++;
      continue;
    }
    const soldQty = sells.reduce((s, t) => s + t.qty, 0);
    const invested = buys.reduce((s, t) => s + t.sol * solUsd + t.usd, 0);
    const sold = sells.reduce((s, t) => s + t.sol * solUsd + t.usd, 0);
    // What is left of these buys: never more than the wallet holds now (the rest left by transfer).
    const left = Math.max(0, Math.min(held[mint] ?? 0, bought - soldQty));
    const holding = left * (price[mint] ?? 0);
    const cost = (q: number) => invested * Math.min(1, q / bought);
    const realized = sold - cost(soldQty);
    const pnl = sold + holding - invested;
    tokens.push({
      mint,
      symbol: symbols[mint] ?? short(mint),
      buys: buys.length,
      sells: sells.length,
      invested,
      sold,
      holding,
      realized,
      unrealized: pnl - realized,
      pnl,
      pct: invested > 0 ? (pnl / invested) * 100 : 0,
      firstBuy: Math.min(...buys.map((t) => t.time)),
    });
  }
  tokens.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  const sum = (k: 'invested' | 'realized' | 'unrealized' | 'pnl') =>
    tokens.reduce((s, t) => s + t[k], 0);
  const invested = sum('invested'),
    pnl = sum('pnl');
  const kept = new Set(tokens.map((t) => t.mint));
  const ledger = trades.filter((t) => kept.has(t.mint));
  return {
    wallet,
    since,
    at,
    solUsd,
    tokens,
    invested,
    realized: sum('realized'),
    unrealized: sum('unrealized'),
    pnl,
    pct: invested > 0 ? (pnl / invested) * 100 : 0,
    pnlSol: solUsd > 0 ? pnl / solUsd : 0,
    winners: tokens.filter((t) => t.pnl > 0).length,
    trades: ledger.length,
    skipped,
    complete,
    ledger,
  };
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

async function holdings(
  env: Env,
  wallet: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const programId of [
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  ]) {
    const r = await rpc<TokenAccounts>(env, 'getTokenAccountsByOwner', [
      wallet,
      { programId },
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    for (const a of r.value) {
      const { mint, tokenAmount } = a.account.data.parsed.info;
      out[mint] = (out[mint] ?? 0) + (tokenAmount.uiAmount ?? 0);
    }
  }
  return out;
}

export const PERIODS = {
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  all: Number.POSITIVE_INFINITY,
} as const;
export type Period = keyof typeof PERIODS;

/** The wallet's PnL over a period; with `mint`, on that token only (all its trades in the window). */
export async function walletPnl(
  env: Env,
  wallet: string,
  period: Period,
  o: { mint?: string; cap?: number; now?: number; concurrency?: number } = {},
): Promise<Pnl> {
  const at = o.now ?? Date.now();
  const since = period === 'all' ? 0 : at - PERIODS[period];
  const h = await history(env, wallet, {
    since,
    cap: o.cap,
    concurrency: o.concurrency,
  });
  const trades = o.mint ? h.trades.filter((t) => t.mint === o.mint) : h.trades;
  const mints = [...new Set(trades.map((t) => t.mint))];
  const [held, px, meta] = await Promise.all([
    holdings(env, wallet),
    prices(env, [MINTS.SOL, ...mints]),
    mints.length
      ? tokenInfo(env, mints)
      : Promise.resolve({} as Awaited<ReturnType<typeof tokenInfo>>),
  ]);
  const solUsd = px[MINTS.SOL];
  if (!(solUsd > 0))
    throw new ToolError('No SOL price right now: try again in a minute.');
  const symbols = Object.fromEntries(
    mints.map((m) => [m, meta[m]?.symbol ?? short(m)]),
  );
  return summarize(
    wallet,
    trades,
    held,
    px,
    symbols,
    solUsd,
    since,
    at,
    h.complete,
  );
}

/** How the numbers are made, for the proof page. */
export const METHOD = [
  'Every swap of the wallet in the period between SOL or a stablecoin and one token is read from Solana. Transfers, liquidity moves and multi-token transactions are left out.',
  "Invested is what the buys paid, fees included; sold is what the sells received. Holding is what is left of those buys, at today's price, never more than the wallet holds.",
  'PnL = sold + holding − invested. Realized counts the sells against the average cost of the buys; the rest is unrealized.',
  "SOL amounts are exact; they are shown in dollars at today's SOL price. A token sold in the period but bought before it is left out: its cost is not in the period.",
];
