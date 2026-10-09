// What the confirmation sheet shows, computed by code from the exact arguments the agent will
// run with: never a sentence written by the model. A swap is quoted by Jupiter, balances and the
// receiver are read on the chain. The friction follows the risk:
//   info  → two buttons;
//   ack   → a box to tick first ("I understand"), with the reasons listed;
//   block → no confirm button, the reason says why (no quote, not enough funds, wrong address).
import { checkToken } from './check-token';
import { moveOf } from './garde';
import {
  DEFAULT_EXPIRY_DAYS,
  type ExitOrder,
  MIN_ROUND_USD,
  defaultSlippage,
  exitKind,
  planExit,
  validateDca,
  validateExit,
} from './jupiter-orders';
import {
  type Env,
  MINTS,
  STALE_MS,
  type TokenInfo,
  amount,
  getJson,
  isAddress,
  jupiter,
  prices,
  rpc,
  short,
  tokenInfo,
  usd,
} from './lib';

export type Friction = 'info' | 'ack' | 'block';

export interface Row {
  label: string;
  value: string;
  /** Real data (amounts, addresses) is set in mono. */
  mono?: boolean;
}

export interface Note {
  level: 'warn' | 'block';
  text: string;
}

export interface Preview {
  tool: string;
  title: string;
  rows: Row[];
  notes: Note[];
  friction: Friction;
  /** When the numbers were read (ms). The sheet shows the age and asks for a refresh past `STALE_MS`. */
  at: number;
  source: string;
}

const MAJORS = new Set<string>([MINTS.SOL, MINTS.USDC, MINTS.USDT]);
/** Price impact past which the user ticks a box before confirming. */
export const IMPACT_WARN_PCT = 2;

const sym = (meta: Record<string, TokenInfo>, mint: string) =>
  mint === MINTS.SOL ? 'SOL' : (meta[mint]?.symbol ?? short(mint));
const decimalsOf = (meta: Record<string, TokenInfo>, mint: string) =>
  mint === MINTS.SOL ? 9 : meta[mint]?.decimals;
const raw = (n: number, decimals: number) =>
  (
    BigInt(Math.round(n * 10 ** Math.min(decimals, 9))) *
    BigInt(10) ** BigInt(Math.max(decimals - 9, 0))
  ).toString();

/** What the wallet holds of a token, in whole tokens. */
export async function balanceOf(
  env: Env,
  wallet: string,
  mint: string,
): Promise<number> {
  if (mint === MINTS.SOL)
    return (
      (
        await rpc<{ value: number }>(env, 'getBalance', [
          wallet,
          { commitment: 'confirmed' },
        ])
      ).value / 1e9
    );
  const r = await rpc<{
    value: {
      account: {
        data: {
          parsed: { info: { tokenAmount: { uiAmount: number | null } } };
        };
      };
    }[];
  }>(env, 'getTokenAccountsByOwner', [
    wallet,
    { mint },
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]);
  return r.value.reduce(
    (t, a) => t + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
    0,
  );
}

interface Quote {
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan?: { swapInfo?: { label?: string } }[];
}

export async function preview(
  env: Env,
  tool: string,
  args: unknown,
  wallet: string,
  now = Date.now(),
): Promise<Preview> {
  const move = moveOf(tool, args);
  const a = (args ?? {}) as Record<string, unknown>;
  const rows: Row[] = [];
  const notes: Note[] = [];
  const block = (text: string) => notes.push({ level: 'block', text });
  const warn = (text: string) => notes.push({ level: 'warn', text });
  const done = (title: string, source: string): Preview => ({
    tool,
    title,
    rows,
    notes,
    at: now,
    source,
    friction: notes.some((n) => n.level === 'block')
      ? 'block'
      : notes.length
        ? 'ack'
        : 'info',
  });

  if (!move || !(move.amount > 0) || !isAddress(move.mint)) {
    block('The agent sent arguments that cannot be read. Nothing will run.');
    return done('Unreadable request', 'chore');
  }

  const mints = [
    move.mint,
    ...(isAddress(move.to) && tool !== 'sendTokens' ? [move.to] : []),
  ];
  const [meta, px, held] = await Promise.all([
    tokenInfo(env, mints).catch(() => ({}) as Record<string, TokenInfo>),
    prices(env, mints).catch(() => ({}) as Record<string, number>),
    balanceOf(env, wallet, move.mint).catch(() => undefined),
  ]);
  const inSym = sym(meta, move.mint);
  const inUsd =
    px[move.mint] !== undefined ? px[move.mint] * move.amount : undefined;
  const pay = `${amount(move.amount)} ${inSym}${inUsd !== undefined ? ` (${usd(inUsd)})` : ''}`;
  if (held === undefined)
    warn(
      'Could not read your balance: the transaction may fail if it is too low.',
    );
  else if (held < move.amount)
    block(
      `Your wallet holds ${amount(held)} ${inSym}, less than ${amount(move.amount)}.`,
    );
  const inDecimals = decimalsOf(meta, move.mint);
  if (inDecimals === undefined) {
    block(`Unknown token ${short(move.mint)}: no amount can be computed.`);
    return done('Unknown token', 'Jupiter');
  }

  if (tool === 'swapTokens') {
    const outSym = sym(meta, move.to);
    const outDecimals = decimalsOf(meta, move.to);
    const slippageBps = typeof a.slippageBps === 'number' ? a.slippageBps : 300;
    rows.push({ label: 'You pay', value: pay, mono: true });
    // The quote and the token check do not depend on each other: both start now.
    const quote =
      outDecimals === undefined
        ? Promise.reject(new Error('unknown output'))
        : getJson<Quote>(
            env,
            ...jupiterQuote(
              env,
              move.mint,
              move.to,
              raw(move.amount, inDecimals),
              slippageBps,
            ),
          );
    quote.catch(() => undefined);
    const checking =
      !MAJORS.has(move.to) && isAddress(move.to)
        ? checkToken(env, move.to, now).catch(() => undefined)
        : undefined;
    try {
      const q = await quote;
      if (outDecimals === undefined) throw new Error('unknown output');
      const out = Number(q.outAmount) / 10 ** outDecimals;
      const min = Number(q.otherAmountThreshold) / 10 ** outDecimals;
      const impact = Number(q.priceImpactPct) * 100;
      rows.push(
        {
          label: 'You receive about',
          value: `${amount(out)} ${outSym}`,
          mono: true,
        },
        {
          label: 'At least',
          value: `${amount(min)} ${outSym}, or nothing happens`,
          mono: true,
        },
        {
          label: 'Slippage allowed',
          value: `${(slippageBps / 100).toFixed(1)}%`,
          mono: true,
        },
        {
          label: 'Price impact',
          value: impact < 0.01 ? '<0.01%' : `${impact.toFixed(2)}%`,
          mono: true,
        },
      );
      const route = [
        ...new Set(
          (q.routePlan ?? []).map((r) => r.swapInfo?.label).filter(Boolean),
        ),
      ];
      if (route.length) rows.push({ label: 'Route', value: route.join(', ') });
      if (impact >= IMPACT_WARN_PCT)
        warn(
          `Your order moves the price by ${impact.toFixed(1)}%: you get noticeably less than the market price.`,
        );
    } catch {
      block(
        'Jupiter returned no quote for this pair, so the outcome cannot be shown. Nothing will run.',
      );
    }
    if (checking) {
      const check = await checking;
      if (!check) warn(`${outSym} could not be checked.`);
      else if (check.counts.risk > 0) {
        const first = check.signals.find((s) => s.level === 'risk');
        warn(
          `${check.counts.risk} red flag${check.counts.risk > 1 ? 's' : ''} on ${outSym}${first ? `: ${first.text}` : '.'}`,
        );
      }
    }
    return done(
      `Swap ${amount(move.amount)} ${inSym} for ${outSym}`,
      'Jupiter quote',
    );
  }

  if (tool === 'sendTokens') {
    rows.push(
      { label: 'You send', value: pay, mono: true },
      { label: 'To', value: move.to, mono: true },
    );
    if (!isAddress(move.to)) block('The destination is not a Solana address.');
    else if (move.to === wallet) block('The destination is your own wallet.');
    else {
      type Info = {
        value: null | {
          executable: boolean;
          data: { parsed?: { type?: string } } | unknown;
        };
      };
      const info = await rpc<Info>(env, 'getAccountInfo', [
        move.to,
        { encoding: 'jsonParsed', commitment: 'confirmed' },
      ]).catch(() => undefined);
      const kind = (
        info?.value?.data as { parsed?: { type?: string } } | undefined
      )?.parsed?.type;
      if (!info) warn('Could not read the destination on the chain.');
      else if (!info.value)
        warn(
          'This address has never been used on Solana. Check it character by character: a transfer cannot be undone.',
        );
      else if (info.value.executable)
        block(
          'This address is a program, not a wallet: tokens sent there are lost.',
        );
      else if (kind === 'mint')
        block(
          'This address is a token, not a wallet: tokens sent there are lost.',
        );
      else if (kind === 'account')
        warn(
          'This address is a token account, not a wallet. Most wallets expect the owner address.',
        );
    }
    return done(`Send ${amount(move.amount)} ${inSym}`, 'Solana RPC');
  }

  if (tool === 'launchToken') {
    rows.push(
      { label: 'New token', value: `${String(a.name ?? '')} (${move.to})` },
      { label: 'Your first buy', value: pay, mono: true },
    );
    warn('Launching a token is public and permanent: it cannot be deleted.');
    return done(`Launch ${move.to} on Pump.fun`, 'Pump.fun');
  }

  if (tool === 'createLimitOrder') {
    const trigger = String(a.triggerMint ?? '');
    const target = Number(a.priceUsd);
    const triggerPx =
      trigger === move.mint || trigger === move.to
        ? (
            await prices(env, [trigger]).catch(
              () => ({}) as Record<string, number>,
            )
          )[trigger]
        : undefined;
    rows.push(
      { label: 'You sell', value: pay, mono: true },
      { label: 'For', value: sym(meta, move.to) },
      {
        label: 'When',
        value: `${sym(meta, trigger)} goes ${a.condition} ${usd(target)}`,
        mono: true,
      },
      {
        label: 'Price now',
        value: triggerPx !== undefined ? usd(triggerPx) : 'unknown',
        mono: true,
      },
      {
        label: 'Until',
        value: `${typeof a.expiresInDays === 'number' ? a.expiresInDays : DEFAULT_EXPIRY_DAYS} days, or until you cancel it`,
      },
    );
    if (inUsd !== undefined && inUsd < MIN_ROUND_USD)
      block(
        `Jupiter takes orders of at least ${usd(MIN_ROUND_USD)}; this one is worth ${usd(inUsd)}.`,
      );
    if (
      triggerPx !== undefined &&
      (a.condition === 'above' ? triggerPx >= target : triggerPx <= target)
    )
      warn(
        'The condition is already met: the order would fill right away, like a swap.',
      );
    return done(`Limit order on ${sym(meta, trigger)}`, 'Jupiter price');
  }

  if (tool === 'createExitOrder') {
    const now$ = px[move.mint];
    const num = (k: string) =>
      typeof a[k] === 'number' ? (a[k] as number) : undefined;
    const vs = (p: number) =>
      now$
        ? ` (${p >= now$ ? '+' : '−'}${Math.abs((p / now$ - 1) * 100).toFixed(1)}%)`
        : '';
    rows.push(
      { label: 'You sell', value: pay, mono: true },
      { label: 'For', value: sym(meta, move.to) },
    );
    try {
      const plan = planExit(
        {
          takeProfitUsd: num('takeProfitUsd'),
          takeProfitPct: num('takeProfitPct'),
          stopLossUsd: num('stopLossUsd'),
          stopLossPct: num('stopLossPct'),
          trailingPct: num('trailingPct'),
        },
        now$,
      );
      const o: ExitOrder = {
        inputMint: move.mint,
        outputMint: move.to,
        inputAmount: '0',
        ...plan,
      };
      if (plan.takeProfitUsd !== undefined)
        rows.push({
          label: 'Take-profit',
          value: `sells if ${inSym} reaches ${usd(plan.takeProfitUsd)}${vs(plan.takeProfitUsd)}`,
          mono: true,
        });
      if (plan.stopLossUsd !== undefined)
        rows.push({
          label: 'Stop-loss',
          value: `sells if ${inSym} falls to ${usd(plan.stopLossUsd)}${vs(plan.stopLossUsd)}`,
          mono: true,
        });
      if (plan.trailingBps !== undefined)
        rows.push({
          label: 'Trailing stop',
          value: `sells after a ${(plan.trailingBps / 100).toFixed(1)}% fall from its best price`,
          mono: true,
        });
      rows.push(
        {
          label: 'Price now',
          value: now$ !== undefined ? usd(now$) : 'unknown',
          mono: true,
        },
        {
          label: 'Max slippage',
          value:
            plan.takeProfitUsd !== undefined && plan.stopLossUsd !== undefined
              ? 'auto on the take-profit, 20% on the stop-loss (Jupiter)'
              : defaultSlippage({
                  inputMint: move.mint,
                  triggerMint: move.mint,
                  triggerCondition:
                    plan.takeProfitUsd !== undefined ? 'above' : 'below',
                }),
        },
        {
          label: 'Until',
          value: `${typeof a.expiresInDays === 'number' ? a.expiresInDays : DEFAULT_EXPIRY_DAYS} days, or until you cancel it`,
        },
        { label: 'Where the tokens wait', value: 'your Jupiter vault' },
      );
      if (exitKind(o) === 'oco')
        rows.push({
          label: 'One or the other',
          value: 'when one side sells, the other is cancelled',
        });
      validateExit(o, now$, inUsd);
      if (
        num('takeProfitPct') !== undefined ||
        num('stopLossPct') !== undefined
      )
        warn(
          'The percentages are applied to the price when the order is placed, which can differ a little from the price above.',
        );
      if (plan.stopLossUsd !== undefined || plan.trailingBps !== undefined)
        warn(
          'A stop sells at the market once triggered: in a fast fall, you can get much less than the stop price.',
        );
    } catch (e) {
      block(
        e instanceof Error ? e.message : 'Jupiter would refuse this order.',
      );
    }
    return done(`Exit plan for ${inSym}`, 'Jupiter price');
  }

  if (tool === 'createDcaOrder') {
    const rounds = Number(a.rounds);
    const interval = Number(a.intervalSeconds);
    rows.push(
      { label: 'Budget', value: pay, mono: true },
      { label: 'Buys', value: sym(meta, move.to) },
      {
        label: 'Rounds',
        value: `${rounds}, every ${interval % 86400 === 0 ? `${interval / 86400} d` : `${Math.round(interval / 3600)} h`}`,
        mono: true,
      },
      {
        label: 'Per round',
        value: `${amount(move.amount / rounds)} ${inSym}`,
        mono: true,
      },
      {
        label: 'Where the money waits',
        value: 'your Jupiter vault, cancel anytime',
      },
    );
    try {
      validateDca(
        {
          inputMint: move.mint,
          outputMint: move.to,
          inputAmount: '0',
          orderCount: rounds,
          intervalSeconds: interval,
        },
        inUsd,
      );
    } catch (e) {
      block(e instanceof Error ? e.message : 'Jupiter would refuse this DCA.');
    }
    return done(`DCA into ${sym(meta, move.to)}`, 'Jupiter price');
  }

  block('This tool has no review sheet yet. Nothing will run.');
  return done('Unknown action', 'chore');
}

function jupiterQuote(
  env: Env,
  input: string,
  output: string,
  rawAmount: string,
  slippageBps: number,
): [string, RequestInit] {
  return jupiter(
    env,
    `/swap/v1/quote?inputMint=${input}&outputMint=${output}&amount=${rawAmount}&slippageBps=${slippageBps}`,
  );
}

export { STALE_MS };
