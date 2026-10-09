// Shared helpers for chore's agent tools: JSON fetch, Solana RPC, token metadata.
// No dependencies: global fetch only (Node 18+, browsers, Next.js server).

export type Fetch = typeof fetch;

export interface Env {
  rpcUrl: string;
  /** Jupiter API base. lite-api works without a key; api.jup.ag needs `jupiterApiKey`. */
  jupiterBase?: string;
  jupiterApiKey?: string;
  fetch?: Fetch;
}

export const MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

export const TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
] as const;

/** Programs worth naming in a plain-language explanation. */
export const PROGRAMS: Record<string, string> = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter',
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'Pump.fun',
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: 'PumpSwap',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium',
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: 'Raydium CLMM',
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca',
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: 'Meteora',
  '11111111111111111111111111111111': 'System',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'Token-2022',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token',
  ComputeBudget111111111111111111111111111111: 'Compute Budget',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo',
};

/** Programs that only set up a transaction; never the "what happened" of it. */
export const PLUMBING = new Set([
  'System',
  'Token',
  'Token-2022',
  'Associated Token',
  'Compute Budget',
  'Memo',
]);

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isAddress = (s: string) => BASE58.test(s);
export const isSignature = (s: string) =>
  /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(s);

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export async function getJson<T>(
  env: Env,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const f = env.fetch ?? fetch;
  const res = await f(url, init);
  if (!res.ok)
    throw new ToolError(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

/** Tries after a 429 from the RPC, waiting 0.4 s, 0.8 s, 1.6 s. */
export const RPC_RETRIES = 3;

export async function rpc<T>(
  env: Env,
  method: string,
  params: unknown[],
): Promise<T> {
  const f = env.fetch ?? fetch;
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  };
  let res = await f(env.rpcUrl, init);
  for (let i = 0; res.status === 429 && i < RPC_RETRIES; i++) {
    await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    res = await f(env.rpcUrl, init);
  }
  if (!res.ok)
    throw new ToolError(
      `${new URL(env.rpcUrl, 'http://rpc').host} answered ${res.status}`,
    );
  const body = (await res.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (body.error) throw new ToolError(`RPC ${method}: ${body.error.message}`);
  return body.result as T;
}

export function jupiter(env: Env, path: string): [string, RequestInit] {
  const base =
    env.jupiterBase ??
    (env.jupiterApiKey ? 'https://api.jup.ag' : 'https://lite-api.jup.ag');
  const headers: Record<string, string> = {};
  if (env.jupiterApiKey) headers['x-api-key'] = env.jupiterApiKey;
  return [base + path, { headers }];
}

/** Jupiter Tokens API v2 record (fields used here; the API returns more). */
export interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  usdPrice?: number;
  liquidity?: number;
  holderCount?: number | null;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  isVerified?: boolean | null;
  organicScore?: number;
  organicScoreLabel?: 'high' | 'medium' | 'low';
  firstPool?: { id: string; createdAt: string };
  launchpad?: string;
  tags?: string[];
  stats24h?: { priceChange?: number };
  audit?: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
    devBalancePercentage?: number;
    devMints?: number;
  };
}

/** Token records for up to 100 mints, keyed by mint. Unknown mints are absent. */
export async function tokenInfo(
  env: Env,
  mints: string[],
): Promise<Record<string, TokenInfo>> {
  const out: Record<string, TokenInfo> = {};
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const [url, init] = jupiter(
      env,
      `/tokens/v2/search?query=${chunk.join(',')}`,
    );
    const list = await getJson<TokenInfo[]>(env, url, init);
    for (const t of list) if (chunk.includes(t.id)) out[t.id] = t;
  }
  return out;
}

/** USD prices from Jupiter Price API v3, keyed by mint. Mints without a price are absent. */
export async function prices(
  env: Env,
  mints: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < mints.length; i += 50) {
    const chunk = mints.slice(i, i + 50);
    const [url, init] = jupiter(env, `/price/v3?ids=${chunk.join(',')}`);
    const body = await getJson<Record<string, { usdPrice?: number } | null>>(
      env,
      url,
      init,
    );
    for (const [mint, p] of Object.entries(body))
      if (p && typeof p.usdPrice === 'number') out[mint] = p.usdPrice;
  }
  return out;
}

export const short = (a: string) =>
  a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;

const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** Below 0.001, the run of zeros is written as a subscript: 0.00001335 → "0.0₄1335". */
export function tiny(n: number): string {
  const [mantissa, exp] = Math.abs(n).toExponential(3).split('e');
  const digits = mantissa.replace('.', '').replace(/0+$/, '') || '0';
  const zeros = -Number(exp) - 1;
  const sub = String(zeros)
    .split('')
    .map((d) => SUB[Number(d)])
    .join('');
  return `${n < 0 ? '−' : ''}0.0${sub}${digits}`;
}

/** Plain amounts: no trailing zeros, up to 6 decimals, thousands separated. */
export function amount(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return n
    .toLocaleString('en-US', { maximumFractionDigits: digits })
    .replace('-', '−');
}

/** Dollars; memecoin prices below $0.001 get the subscript notation. */
export const usd = (n: number) =>
  Math.abs(n) > 0 && Math.abs(n) < 0.001
    ? `${n < 0 ? '−' : ''}$${tiny(Math.abs(n))}`
    : n
        .toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: Math.abs(n) >= 1 ? 2 : 6,
        })
        .replace('-', '−');

/** A change with its sign and an arrow, so it never relies on colour alone: "▲ +12.4%". */
export const pct = (n: number) =>
  Math.abs(n) < 0.005
    ? '· 0.00%'
    : `${n > 0 ? '▲ +' : '▼ −'}${Math.abs(n).toFixed(Math.abs(n) >= 10 ? 1 : 2)}%`;

/** Past this age (ms) a quote is refreshed before anyone confirms on it. */
export const STALE_MS = 30_000;

/** How old a piece of data is: "4 s ago", "3 min ago", "2 h ago". */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
}
