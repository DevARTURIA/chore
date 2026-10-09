// Tool: price alerts ("tell me on Telegram when SOL goes under 120").
// The agent creates the alert with `parseAlert`; the app's existing automation runner calls
// `checkAlerts` on its schedule and sends each returned message to Telegram.
import {
  type Env,
  MINTS,
  ToolError,
  getJson,
  isAddress,
  prices,
  tokenInfo,
  usd,
} from './lib';

export interface Alert {
  id: string;
  mint: string;
  symbol: string;
  direction: 'above' | 'below';
  priceUsd: number;
  /** True once fired; re-arms when the price goes back to the other side. */
  fired: boolean;
}

export interface AlertHit {
  alert: Alert;
  price: number;
  message: string;
}

/** Turn the tool's arguments into an alert, resolving a symbol like "SOL" or "JUP" to its mint. */
export async function parseAlert(
  env: Env,
  args: { token: string; direction: 'above' | 'below'; priceUsd: number },
  id: string,
): Promise<Alert> {
  if (!(args.priceUsd > 0))
    throw new ToolError('The price must be a positive number of dollars.');
  if (args.direction !== 'above' && args.direction !== 'below')
    throw new ToolError('Say "above" or "below".');
  let mint = args.token.trim();
  let symbol = mint.toUpperCase();
  const known = (MINTS as Record<string, string>)[symbol];
  if (known) mint = known;
  else if (!isAddress(mint))
    throw new ToolError(
      `Give the token's address for "${args.token}": symbols are not unique on Solana.`,
    );
  const info = await tokenInfo(env, [mint]);
  if (info[mint]) symbol = info[mint].symbol;
  return {
    id,
    mint,
    symbol,
    direction: args.direction,
    priceUsd: args.priceUsd,
    fired: false,
  };
}

/** One pass over all alerts: returns the hits and the alerts with their new state (store them back). */
export async function checkAlerts(
  env: Env,
  alerts: Alert[],
): Promise<{ hits: AlertHit[]; alerts: Alert[] }> {
  if (!alerts.length) return { hits: [], alerts };
  const p = await prices(env, [...new Set(alerts.map((a) => a.mint))]);
  const hits: AlertHit[] = [];
  const next = alerts.map((a) => {
    const price = p[a.mint];
    if (price === undefined) return a;
    const crossed =
      a.direction === 'above' ? price >= a.priceUsd : price <= a.priceUsd;
    if (crossed && !a.fired) {
      const fired = { ...a, fired: true };
      hits.push({
        alert: fired,
        price,
        message: `${a.symbol} is ${a.direction} ${usd(a.priceUsd)}: now ${usd(price)}.`,
      });
      return fired;
    }
    if (!crossed && a.fired) return { ...a, fired: false };
    return a;
  });
  return { hits, alerts: next };
}

/** Stateless check for scheduled runs (the app's automations keep no memory between runs):
 * fires only if the price crossed the line within the last `windowSeconds`, estimated from
 * DexScreener's price change over 5 min, 1 h, 6 h or 24 h on the token's deepest pair. */
export async function crossedRecently(
  env: Env,
  args: {
    mint: string;
    symbol?: string;
    direction: 'above' | 'below';
    priceUsd: number;
    windowSeconds: number;
  },
): Promise<{ triggered: boolean; price: number; message: string }> {
  if (!isAddress(args.mint))
    throw new ToolError('That is not a Solana token address.');
  const pairs = await getJson<DexPair[]>(
    env,
    `https://api.dexscreener.com/tokens/v1/solana/${args.mint}`,
  );
  const own = pairs.filter(
    (p) => p.baseToken?.address === args.mint && p.priceUsd,
  );
  if (!own.length)
    throw new ToolError('No market found for this token on DexScreener.');
  const pair = own.reduce((a, b) =>
    (b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a,
  );
  const price = Number(pair.priceUsd);
  const w = args.windowSeconds;
  const key = w <= 300 ? 'm5' : w <= 3600 ? 'h1' : w <= 21600 ? 'h6' : 'h24';
  const pct = pair.priceChange?.[key];
  const before = typeof pct === 'number' ? price / (1 + pct / 100) : undefined;
  const side = (p: number) =>
    args.direction === 'above' ? p >= args.priceUsd : p <= args.priceUsd;
  // Without a past price, fire whenever the condition holds (the user hears it each run).
  const triggered = side(price) && (before === undefined || !side(before));
  const symbol = args.symbol ?? pair.baseToken.symbol;
  return {
    triggered,
    price,
    message: triggered
      ? `${symbol} is ${args.direction} ${usd(args.priceUsd)}: now ${usd(price)}.`
      : `${symbol} is at ${usd(price)}, no alert.`,
  };
}

interface DexPair {
  baseToken: { address: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  priceChange?: Record<string, number>;
}
