// The guard in front of every tool that moves funds. It runs on the server, inside the tool,
// so neither the model nor a message it read can talk its way past it.
//
// Two ways through:
//   1. the user confirmed this exact move (same tool, token, amount, destination);
//   2. auto-approve: the move is worth no more than the user's per-transaction limit, and the
//      moves that went through without a click in the last 24 h stay under the daily limit.
//      Only for moves that keep the funds with the user (swaps, orders into their own vault):
//      sending to someone else or launching a token always needs a click.
// Auto-approve is off by default (limits at 0). Scheduled automations have no one to click,
// so they only ever go through the second way.
import { type Env, MINTS, prices, usd } from './lib';

export interface Limits {
  /** Largest move, in dollars, that may run without a click. 0 turns auto-approve off. */
  perTxUsd: number;
  /** Ceiling, in dollars, on what runs without a click over a rolling 24 h. */
  perDayUsd: number;
}

export const NO_AUTO: Limits = { perTxUsd: 0, perDayUsd: 0 };

/** What a tool call would take out of the wallet, and where it goes. */
export interface Move {
  tool: string;
  mint: string;
  amount: number;
  /** Output token, receiver address or new token symbol. */
  to: string;
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : Number.NaN);

/** Every tool that moves funds, and how to read its move from its arguments. */
export const MOVERS: Record<string, (a: Args) => Omit<Move, 'tool'>> = {
  swapTokens: (a) => ({
    mint: str(a.inputMint),
    amount: num(a.amount),
    to: str(a.outputMint),
  }),
  sendTokens: (a) => ({
    mint: str(a.tokenAddress),
    amount: num(a.amount),
    to: str(a.receiverAddress),
  }),
  launchToken: (a) => ({
    mint: MINTS.SOL,
    amount: num(a.initalBuySOL),
    to: str(a.symbol),
  }),
  createLimitOrder: (a) => ({
    mint: str(a.inputMint),
    amount: num(a.amount),
    to: str(a.outputMint),
  }),
  createExitOrder: (a) => ({
    mint: str(a.mint),
    amount: num(a.amount),
    to: str(a.receiveMint) || MINTS.USDC,
  }),
  createDcaOrder: (a) => ({
    mint: str(a.inputMint),
    amount: num(a.amount),
    to: str(a.outputMint),
  }),
};

export const movesFunds = (tool: string) => tool in MOVERS;

/** Moves that never run without a click, whatever the limits: the funds leave the user. */
export const ALWAYS_CONFIRM = new Set(['sendTokens', 'launchToken']);

export function moveOf(tool: string, args: unknown): Move | undefined {
  const read = MOVERS[tool];
  if (!read || !args || typeof args !== 'object') return undefined;
  return { tool, ...read(args as Args) };
}

/** Same tool, token and destination; amounts equal to a billionth. */
export function sameMove(a: Move, b: Move): boolean {
  return (
    a.tool === b.tool &&
    a.mint === b.mint &&
    a.to === b.to &&
    Number.isFinite(a.amount) &&
    Math.abs(a.amount - b.amount) <= 1e-9 * Math.max(1, Math.abs(a.amount))
  );
}

export type Verdict =
  | { ok: true; confirmed: boolean }
  | { ok: false; reason: string };

/** The rule itself, without any I/O. */
export function decide(p: {
  move: Move;
  /** The move the user confirmed in this turn, if any. */
  confirmed?: Move;
  /** Dollar value of the move; undefined when no price is known. */
  valueUsd?: number;
  limits: Limits;
  /** Dollars moved without a click over the last 24 h. */
  spentUsd: number;
}): Verdict {
  const { move, confirmed, valueUsd, limits, spentUsd } = p;
  if (!(move.amount > 0))
    return { ok: false, reason: 'The amount must be a positive number.' };
  if (confirmed) {
    if (sameMove(confirmed, move)) return { ok: true, confirmed: true };
    return {
      ok: false,
      reason:
        'Not executed: this differs from what the user confirmed. Ask for confirmation again with the exact token, amount and destination.',
    };
  }
  const ask = 'Not executed: ask the user for confirmation first.';
  if (ALWAYS_CONFIRM.has(move.tool))
    return {
      ok: false,
      reason: `${ask} (Sending funds away always needs a click.)`,
    };
  if (!(limits.perTxUsd > 0))
    return { ok: false, reason: `${ask} (Auto-approve is off.)` };
  if (valueUsd === undefined)
    return {
      ok: false,
      reason: `${ask} (No price for this token, so it cannot be auto-approved.)`,
    };
  if (valueUsd > limits.perTxUsd)
    return {
      ok: false,
      reason: `${ask} (Worth about ${usd(valueUsd)}, above the auto-approve limit of ${usd(limits.perTxUsd)} per transaction.)`,
    };
  if (spentUsd + valueUsd > limits.perDayUsd)
    return {
      ok: false,
      reason: `${ask} (This would bring auto-approved moves to ${usd(spentUsd + valueUsd)} over 24 h, above the limit of ${usd(limits.perDayUsd)}.)`,
    };
  return { ok: true, confirmed: false };
}

/** Dollar value of a move from Jupiter's price, or undefined. */
export async function valueOf(
  env: Env,
  move: Move,
): Promise<number | undefined> {
  const px = await prices(env, [move.mint]).catch(
    () => ({}) as Record<string, number>,
  );
  return px[move.mint] !== undefined ? px[move.mint] * move.amount : undefined;
}

/** Where the guard keeps its state: the app backs it with the database. */
export interface Ledger {
  limits(): Promise<Limits>;
  /** Dollars moved without a click since `since` (ms). */
  spentSince(since: number): Promise<number>;
  record(entry: {
    move: Move;
    valueUsd?: number;
    confirmed: boolean;
  }): Promise<void>;
}

/**
 * Wraps a tool's execute. `confirmed` is the move the user confirmed in this turn; it is used
 * once, so a second call in the same turn needs its own confirmation.
 */
export function guard<A, R>(
  tool: string,
  execute: (args: A) => Promise<R>,
  ctx: {
    env: Env;
    ledger: Ledger;
    confirmed?: { move?: Move };
    now?: () => number;
    queue?: Promise<unknown>;
  },
): (args: A) => Promise<R | { success: false; error: string }> {
  // Calls sharing a context run one after the other: two calls in the same step must not
  // both use one confirmation, nor both read the daily total before either is recorded.
  return (args: A) => {
    const turn = (ctx.queue ?? Promise.resolve()).then(() => once(args));
    ctx.queue = turn.catch(() => undefined);
    return turn;
  };
  async function once(args: A): Promise<R | { success: false; error: string }> {
    const move = moveOf(tool, args);
    if (!move)
      return { success: false, error: 'Not executed: unreadable arguments.' };
    const confirmed = ctx.confirmed?.move;
    const now = (ctx.now ?? Date.now)();
    const [limits, spentUsd, valueUsd] = await Promise.all([
      ctx.ledger.limits(),
      ctx.ledger.spentSince(now - 86_400_000),
      valueOf(ctx.env, move),
    ]);
    const verdict = decide({ move, confirmed, valueUsd, limits, spentUsd });
    if (!verdict.ok) return { success: false, error: verdict.reason };
    if (verdict.confirmed && ctx.confirmed) ctx.confirmed.move = undefined;
    const entry = { move, valueUsd, confirmed: verdict.confirmed };
    let result: R;
    try {
      result = await execute(args);
    } catch (error) {
      // A throw can come after the transaction left: count it, the limit errs on the safe side.
      await ctx.ledger.record(entry);
      throw error;
    }
    const failed =
      !!result &&
      typeof result === 'object' &&
      (result as { success?: unknown }).success === false;
    if (!failed) await ctx.ledger.record(entry);
    return result;
  }
}
