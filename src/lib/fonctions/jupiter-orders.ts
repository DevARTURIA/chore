// Tool: limit orders, take-profit / stop-loss, trailing stops and DCA through Jupiter's Trigger API v2
// (docs: developers.jup.ag/docs/trigger).
// Wallet-agnostic: the app passes a `Signer` backed by its embedded wallet (Privy). Nothing here
// holds a key. Flow: authenticate (sign a challenge) → vault → craft deposit → sign → create.
// `review*` builds the rows for the confirm sheet; call `create*` only after the user confirms.
import { type Env, ToolError, isAddress, usd } from './lib';

export interface Signer {
  publicKey: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  /** Signs a base64 VersionedTransaction and returns it base64, signed, not sent. */
  signTransaction(base64Tx: string): Promise<string>;
}

export interface LimitOrder {
  inputMint: string;
  outputMint: string;
  /** Total input, in the input token's smallest unit, as a string. */
  inputAmount: string;
  /** Token whose USD price triggers the order (input or output mint). */
  triggerMint: string;
  triggerCondition: 'above' | 'below';
  triggerPriceUsd: number;
  /** Left out, Jupiter picks: auto for a take-profit or a buy below, 20% for a stop-loss or a buy above. */
  slippageBps?: number;
  /** Milliseconds since epoch. Jupiter V2 refuses an order without one: `DEFAULT_EXPIRY_DAYS` when left out. */
  expiresAt?: number;
}

/** Selling a token you hold on the way up, on the way down, or both (one deposit; one leg cancels the other). */
export interface ExitOrder {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  takeProfitUsd?: number;
  stopLossUsd?: number;
  /** Trailing stop instead of prices: sells once the price falls this far from its best since the order. */
  trailingBps?: number;
  expiresAt?: number;
}

export type ExitKind = 'oco' | 'take-profit' | 'stop-loss' | 'trailing';

export interface DcaOrder {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  orderCount: number;
  intervalSeconds: number;
  /** ISO time for the first round; defaults to now (API: up to 30 days out). */
  beginFillAt?: string;
}

export interface Row {
  label: string;
  value: string;
}

const BASE = 'https://api.jup.ag/trigger/v2';
/** Jupiter's current minimum per order and per DCA round; the API is the authority, this only fails early. */
export const MIN_ROUND_USD = 10;
/** Jupiter V2 requires an expiry on every order. */
export const DEFAULT_EXPIRY_DAYS = 30;
export const expiryFrom = (days?: number, now = Date.now()) =>
  now + (days ?? DEFAULT_EXPIRY_DAYS) * 86_400_000;
/** Trailing distance Jupiter accepts, in basis points (0.5% to 90%). */
export const TRAILING_BPS = { min: 50, max: 9000 };

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes: Uint8Array): string {
  // BigInt() calls rather than literals: the app compiles to a target below ES2020.
  const [ZERO, EIGHT, BASE] = [BigInt(0), BigInt(8), BigInt(58)];
  let n = ZERO;
  for (const b of bytes) n = (n << EIGHT) + BigInt(b);
  let s = '';
  while (n > ZERO) {
    s = B58[Number(n % BASE)] + s;
    n /= BASE;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = '1' + s;
  }
  return s;
}

export function validateDca(o: DcaOrder, inputUsd?: number): void {
  if (!isAddress(o.inputMint) || !isAddress(o.outputMint))
    throw new ToolError('Unknown token address.');
  if (!(o.orderCount >= 2))
    throw new ToolError('A DCA needs at least 2 rounds.');
  if (!(o.intervalSeconds >= 60 && o.intervalSeconds <= 31_536_000))
    throw new ToolError('The interval must be between 1 minute and 1 year.');
  if (inputUsd !== undefined && inputUsd / o.orderCount < MIN_ROUND_USD)
    throw new ToolError(
      `Each round must be worth at least ${usd(MIN_ROUND_USD)}: use fewer rounds or a bigger budget.`,
    );
}

export function validateLimit(o: LimitOrder): void {
  if (!isAddress(o.inputMint) || !isAddress(o.outputMint))
    throw new ToolError('Unknown token address.');
  if (o.triggerMint !== o.inputMint && o.triggerMint !== o.outputMint)
    throw new ToolError('The trigger token must be one of the two tokens.');
  if (!(o.triggerPriceUsd > 0))
    throw new ToolError(
      'The trigger price must be a positive number of dollars.',
    );
  if (o.expiresAt !== undefined && o.expiresAt <= Date.now())
    throw new ToolError('The expiry is in the past.');
}

export const exitKind = (o: ExitOrder): ExitKind =>
  o.trailingBps !== undefined
    ? 'trailing'
    : o.takeProfitUsd !== undefined && o.stopLossUsd !== undefined
      ? 'oco'
      : o.takeProfitUsd !== undefined
        ? 'take-profit'
        : 'stop-loss';

export interface ExitArgs {
  takeProfitUsd?: number;
  /** "+50%": the take-profit price is the price now × 1.5. */
  takeProfitPct?: number;
  stopLossUsd?: number;
  /** "30%": the stop-loss price is the price now × 0.7. Always a fall, given as a positive number. */
  stopLossPct?: number;
  trailingPct?: number;
}

/** Percentages become dollar prices from the price now; dollar prices win when both are given. */
export function planExit(
  a: ExitArgs,
  priceNow: number | undefined,
): Pick<ExitOrder, 'takeProfitUsd' | 'stopLossUsd' | 'trailingBps'> {
  const usesPct = a.takeProfitPct !== undefined || a.stopLossPct !== undefined;
  if (usesPct && !(priceNow! > 0))
    throw new ToolError(
      'No price for this token right now: give the take-profit and stop-loss in dollars.',
    );
  if (
    a.stopLossPct !== undefined &&
    !(a.stopLossPct > 0 && a.stopLossPct < 100)
  )
    throw new ToolError('A stop-loss is a fall between 0% and 100%.');
  if (a.takeProfitPct !== undefined && !(a.takeProfitPct > 0))
    throw new ToolError('A take-profit is a rise above 0%.');
  const takeProfitUsd =
    a.takeProfitUsd ??
    (a.takeProfitPct !== undefined
      ? priceNow! * (1 + a.takeProfitPct / 100)
      : undefined);
  const stopLossUsd =
    a.stopLossUsd ??
    (a.stopLossPct !== undefined
      ? priceNow! * (1 - a.stopLossPct / 100)
      : undefined);
  if (a.trailingPct !== undefined) {
    if (takeProfitUsd !== undefined || stopLossUsd !== undefined)
      throw new ToolError(
        'A trailing stop goes alone: no take-profit or stop-loss with it.',
      );
    return { trailingBps: Math.round(a.trailingPct * 100) };
  }
  if (takeProfitUsd === undefined && stopLossUsd === undefined)
    throw new ToolError(
      'Give a take-profit, a stop-loss, or a trailing distance.',
    );
  return { takeProfitUsd, stopLossUsd };
}

/** Fails early on what Jupiter would refuse, and on a leg that would fill at once. */
export function validateExit(
  o: ExitOrder,
  priceNow?: number,
  inputUsd?: number,
): void {
  if (!isAddress(o.inputMint) || !isAddress(o.outputMint))
    throw new ToolError('Unknown token address.');
  if (o.inputMint === o.outputMint)
    throw new ToolError('You cannot sell a token for itself.');
  const { takeProfitUsd: tp, stopLossUsd: sl, trailingBps: tr } = o;
  if (tr !== undefined) {
    if (tp !== undefined || sl !== undefined)
      throw new ToolError(
        'A trailing stop goes alone: no take-profit or stop-loss with it.',
      );
    if (!(tr >= TRAILING_BPS.min && tr <= TRAILING_BPS.max))
      throw new ToolError(
        'The trailing distance must be between 0.5% and 90%.',
      );
  } else {
    if (tp === undefined && sl === undefined)
      throw new ToolError(
        'Give a take-profit, a stop-loss, or a trailing distance.',
      );
    if (tp !== undefined && !(tp > 0))
      throw new ToolError(
        'The take-profit must be a positive number of dollars.',
      );
    if (sl !== undefined && !(sl > 0))
      throw new ToolError(
        'The stop-loss must be a positive number of dollars.',
      );
    if (tp !== undefined && sl !== undefined && !(tp > sl))
      throw new ToolError('The take-profit must be above the stop-loss.');
    if (priceNow !== undefined && tp !== undefined && tp <= priceNow)
      throw new ToolError(
        `The take-profit (${usd(tp)}) is not above the price now (${usd(priceNow)}): it would sell right away.`,
      );
    if (priceNow !== undefined && sl !== undefined && sl >= priceNow)
      throw new ToolError(
        `The stop-loss (${usd(sl)}) is not below the price now (${usd(priceNow)}): it would sell right away.`,
      );
  }
  if (o.expiresAt !== undefined && o.expiresAt <= Date.now())
    throw new ToolError('The expiry is in the past.');
  if (inputUsd !== undefined && inputUsd < MIN_ROUND_USD)
    throw new ToolError(
      `Jupiter takes orders of at least ${usd(MIN_ROUND_USD)}; this one is worth ${usd(inputUsd)}.`,
    );
}

const every = (s: number) =>
  s % 86400 === 0
    ? `${s / 86400} day${s === 86400 ? '' : 's'}`
    : s % 3600 === 0
      ? `${s / 3600} hour${s === 3600 ? '' : 's'}`
      : `${Math.round(s / 60)} min`;

/** Jupiter's slippage when none is given: auto when selling into strength or buying a dip, 20% when
 * selling into a fall or buying a breakout, so the order still fills when the price moves fast. */
export function defaultSlippage(
  o: Pick<LimitOrder, 'inputMint' | 'triggerMint' | 'triggerCondition'>,
): string {
  const sellingUp =
    o.triggerMint === o.inputMint
      ? o.triggerCondition === 'above'
      : o.triggerCondition === 'below';
  return sellingUp ? 'auto (Jupiter)' : '20% (Jupiter default)';
}

/** Rows for the review sheet. `fmt` turns a raw input amount into "1.5 SOL". */
export function reviewDca(o: DcaOrder, fmt: (raw: string) => string): Row[] {
  return [
    { label: 'Budget', value: fmt(o.inputAmount) },
    {
      label: 'Rounds',
      value: `${o.orderCount}, every ${every(o.intervalSeconds)}`,
    },
    { label: 'Starts', value: o.beginFillAt ?? 'now' },
    {
      label: 'Where the money waits',
      value: 'your Jupiter vault, cancel anytime',
    },
  ];
}
export function reviewLimit(
  o: LimitOrder,
  fmt: (raw: string) => string,
  symbol: (mint: string) => string,
): Row[] {
  return [
    { label: 'You sell', value: fmt(o.inputAmount) },
    { label: 'For', value: symbol(o.outputMint) },
    {
      label: 'When',
      value: `${symbol(o.triggerMint)} goes ${o.triggerCondition} ${usd(o.triggerPriceUsd)}`,
    },
    {
      label: 'Max slippage',
      value:
        o.slippageBps !== undefined
          ? `${(o.slippageBps / 100).toFixed(1)}%`
          : defaultSlippage(o),
    },
    {
      label: 'Expires',
      value: new Date(o.expiresAt ?? expiryFrom()).toISOString().slice(0, 10),
    },
  ];
}

export class TriggerClient {
  private token: string | null = null;
  private readonly env: Env;
  private readonly signer: Signer;

  constructor(env: Env, signer: Signer) {
    if (!env.jupiterApiKey)
      throw new ToolError(
        'Limit orders and DCA need a Jupiter API key (JUPITER_API_KEY).',
      );
    this.env = env;
    this.signer = signer;
  }

  private async call<T>(
    path: string,
    body?: unknown,
    auth = true,
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': this.env.jupiterApiKey!,
    };
    if (auth) headers.authorization = `Bearer ${await this.auth()}`;
    const res = await (this.env.fetch ?? fetch)(
      BASE + path,
      body === undefined
        ? { headers }
        : { method: 'POST', headers, body: JSON.stringify(body) },
    );
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  }

  /** 24h JWT from a signed challenge (a message signature, not a transaction). */
  async auth(): Promise<string> {
    if (this.token) return this.token;
    const ch = await this.call<{ challenge?: string }>(
      '/auth/challenge',
      { walletPubkey: this.signer.publicKey, type: 'message' },
      false,
    );
    if (!ch.data.challenge)
      throw new ToolError(`Jupiter refused the sign-in (${ch.status}).`);
    const sig = await this.signer.signMessage(
      new TextEncoder().encode(ch.data.challenge),
    );
    const v = await this.call<{ token?: string }>(
      '/auth/verify',
      {
        type: 'message',
        walletPubkey: this.signer.publicKey,
        signature: base58(sig),
      },
      false,
    );
    if (!v.data.token)
      throw new ToolError(
        `Jupiter did not accept the signature (${v.status}).`,
      );
    return (this.token = v.data.token);
  }

  private async vault(): Promise<void> {
    let r = await this.call('/vault');
    if (!r.ok) r = await this.call('/vault/register');
    if (!r.ok)
      throw new ToolError(`Could not open your Jupiter vault (${r.status}).`);
  }

  private async deposit(
    inputMint: string,
    outputMint: string,
    amount: string,
    orderType: 'price' | 'dca',
    orderSubType?: 'single' | 'oco',
  ): Promise<{ requestId: string; signed: string }> {
    await this.vault();
    const r = await this.call<{
      requestId?: string;
      transaction?: string;
      error?: string;
    }>('/deposit/craft', {
      inputMint,
      outputMint,
      userAddress: this.signer.publicKey,
      amount,
      orderType,
      ...(orderSubType ? { orderSubType } : {}),
    });
    if (!r.data.requestId || !r.data.transaction)
      throw new ToolError(
        `Jupiter could not prepare the deposit: ${r.data.error ?? r.status}.`,
      );
    return {
      requestId: r.data.requestId,
      signed: await this.signer.signTransaction(r.data.transaction),
    };
  }

  /** Signs the deposit and creates the order. Call only after the user confirmed the review. */
  async createLimit(
    o: LimitOrder,
  ): Promise<{ id: string; txSignature: string }> {
    validateLimit(o);
    const d = await this.deposit(
      o.inputMint,
      o.outputMint,
      o.inputAmount,
      'price',
      'single',
    );
    const r = await this.call<{
      id?: string;
      txSignature?: string;
      error?: string;
    }>('/orders/price', {
      orderType: 'single',
      depositRequestId: d.requestId,
      depositSignedTx: d.signed,
      userPubkey: this.signer.publicKey,
      inputMint: o.inputMint,
      outputMint: o.outputMint,
      inputAmount: o.inputAmount,
      triggerMint: o.triggerMint,
      triggerCondition: o.triggerCondition,
      triggerPriceUsd: o.triggerPriceUsd,
      ...(o.slippageBps !== undefined ? { slippageBps: o.slippageBps } : {}),
      expiresAt: o.expiresAt ?? expiryFrom(),
    });
    if (!r.data.id)
      throw new ToolError(
        `Jupiter refused the order: ${r.data.error ?? r.status}.`,
      );
    return { id: r.data.id, txSignature: r.data.txSignature ?? '' };
  }

  /** Take-profit and stop-loss (OCO when both), or a trailing stop. The token sold is the trigger. */
  async createExit(
    o: ExitOrder,
    priceNow?: number,
    inputUsd?: number,
  ): Promise<{ id: string; txSignature: string; kind: ExitKind }> {
    validateExit(o, priceNow, inputUsd);
    const kind = exitKind(o);
    const d = await this.deposit(
      o.inputMint,
      o.outputMint,
      o.inputAmount,
      'price',
      kind === 'oco' ? 'oco' : 'single',
    );
    const common = {
      depositRequestId: d.requestId,
      depositSignedTx: d.signed,
      userPubkey: this.signer.publicKey,
      inputMint: o.inputMint,
      outputMint: o.outputMint,
      inputAmount: o.inputAmount,
      triggerMint: o.inputMint,
      expiresAt: o.expiresAt ?? expiryFrom(),
    };
    const body =
      kind === 'oco'
        ? {
            ...common,
            orderType: 'oco',
            tpPriceUsd: o.takeProfitUsd,
            slPriceUsd: o.stopLossUsd,
          }
        : kind === 'trailing'
          ? {
              ...common,
              orderType: 'single',
              triggerCondition: 'below',
              trailingBps: o.trailingBps,
            }
          : kind === 'take-profit'
            ? {
                ...common,
                orderType: 'single',
                triggerCondition: 'above',
                triggerPriceUsd: o.takeProfitUsd,
              }
            : {
                ...common,
                orderType: 'single',
                triggerCondition: 'below',
                triggerPriceUsd: o.stopLossUsd,
              };
    const r = await this.call<{
      id?: string;
      txSignature?: string;
      error?: string;
    }>('/orders/price', body);
    if (!r.data.id)
      throw new ToolError(
        `Jupiter refused the order: ${r.data.error ?? r.status}.`,
      );
    return { id: r.data.id, txSignature: r.data.txSignature ?? '', kind };
  }

  async createDca(
    o: DcaOrder,
    inputUsd?: number,
  ): Promise<{ id: string; txSignature: string }> {
    validateDca(o, inputUsd);
    const d = await this.deposit(
      o.inputMint,
      o.outputMint,
      o.inputAmount,
      'dca',
    );
    const r = await this.call<{
      id?: string;
      txSignature?: string;
      error?: string;
    }>('/orders/dca', {
      depositRequestId: d.requestId,
      depositSignedTx: d.signed,
      userPubkey: this.signer.publicKey,
      inputMint: o.inputMint,
      outputMint: o.outputMint,
      inputAmount: o.inputAmount,
      orderCount: o.orderCount,
      intervalSeconds: o.intervalSeconds,
      orderType: 'time_based',
      ...(o.beginFillAt ? { beginFillAt: o.beginFillAt } : {}),
    });
    if (!r.data.id)
      throw new ToolError(
        `Jupiter refused the DCA: ${r.data.error ?? r.status}.`,
      );
    return { id: r.data.id, txSignature: r.data.txSignature ?? '' };
  }
}
