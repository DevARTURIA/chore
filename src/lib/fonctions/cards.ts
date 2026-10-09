// What a share card says, as text, whatever its style (Plage or Nuit) and format (wide or square).
// Built only from numbers the server computed from the chain: the user picks the card, never a figure.
// The image (app: src/lib/cards/render.ts) and the proof page both read this model.
import type { WatchResult } from './holdings-watch';
import { pct, short, usd } from './lib';
import type { Snapshot } from './wallet-digest';
import { METHOD, type Period, type Pnl } from './wallet-pnl';

export type CardKind = 'wallet' | 'token' | 'holdings' | 'rugcheck';
export type CardStyle = 'plage' | 'nuit';
export type CardSky = 'stats' | 'tokens';
export type CardFormat = 'wide' | 'square';

export interface CardModel {
  kind: CardKind;
  /** Top line on the sky: "Wallet 98qN…AvRa" or the token's symbol. */
  title: string;
  sub: string;
  /** Three label / value pairs on the sky. */
  stats: [string, string][];
  /** For a wallet PnL: the three tokens that weighed most, the sky's other choice. */
  movers?: [string, string][];
  big: string;
  line: string;
  /** Left of the mention: the source and the proof code. */
  source: string;
  /** True for the rug check: smaller headline, "Signals, not a guarantee". */
  signals?: boolean;
}

/** One row of the proof page: a transaction the numbers came from. */
export interface ProofRow {
  signature: string;
  time: string;
  symbol: string;
  side: 'buy' | 'sell' | 'held';
  detail: string;
}

export interface Proof {
  method: string[];
  rows: ProofRow[];
  note?: string;
}

export const MENTION = 'Not financial advice · Beach image made with AI.';

/** "+$1,412.30" / "−$2,006.36", a real minus sign. */
export const signedUsd = (n: number) =>
  `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`;
const solAmount = (n: number) => {
  const a = Math.abs(n);
  return `${n >= 0 ? '+' : '−'}${a.toLocaleString('en-US', { maximumFractionDigits: a >= 10 ? 1 : 3 })} SOL`;
};
const PERIOD_TEXT: Record<Period, string> = {
  '24h': 'last 24 hours',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  all: 'all time',
};
const trades = (n: number) => `${n} trade${n === 1 ? '' : 's'}`;
const ago = (ms: number) => {
  const h = Math.max(1, Math.round(ms / 3_600_000));
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
};

export function walletCard(p: Pnl, period: Period, code: string): CardModel {
  if (!p.tokens.length)
    throw new Error(
      `No trade found in the ${PERIOD_TEXT[period]}: nothing to put on a card.`,
    );
  return {
    kind: 'wallet',
    title: `Wallet ${short(p.wallet)}`,
    sub: `PnL · ${p.complete ? PERIOD_TEXT[period] : `last ${p.trades} trades`} · ${p.winners} of ${p.tokens.length} in profit`,
    stats: [
      ['Invested', usd(p.invested)],
      ['Realized', signedUsd(p.realized)],
      ['Unrealized', signedUsd(p.unrealized)],
    ],
    movers: p.tokens.slice(0, 3).map((t) => [t.symbol, signedUsd(t.pnl)]),
    big: signedUsd(p.pnl),
    line: `${pct(p.pct)} · ${solAmount(p.pnlSol)}`,
    source: `Read from Solana · ${trades(p.trades)} · proof ${code}`,
  };
}

export function tokenCard(p: Pnl, mint: string, code: string): CardModel {
  const t = p.tokens.find((x) => x.mint === mint);
  if (!t)
    throw new Error(
      'No buy of this token found in the wallet history read: nothing to put on a card.',
    );
  return {
    kind: 'token',
    title: t.symbol,
    sub: `Wallet ${short(p.wallet)} · held ${ago(p.at - t.firstBuy)}`,
    stats: [
      ['Invested', usd(t.invested)],
      ['Sold', usd(t.sold)],
      ['Holding', usd(t.holding)],
    ],
    big: signedUsd(t.pnl),
    line: `${pct(t.pct)} · ${solAmount(p.solUsd > 0 ? t.pnl / p.solUsd : 0)}`,
    source: `Read from Solana · ${t.buys} buy${t.buys === 1 ? '' : 's'}${t.sells ? ` · ${t.sells} sell${t.sells === 1 ? '' : 's'}` : ''} · proof ${code}`,
  };
}

/** `change24h`: the 24 h move on what is held now, in percent, when the prices give it. */
export function holdingsCard(
  s: Snapshot,
  code: string,
  change24h?: number,
): CardModel {
  const shown = s.holdings.filter((h) => (h.usd ?? 0) >= 1);
  return {
    kind: 'holdings',
    title: `Wallet ${short(s.wallet)}`,
    sub: `${shown.length} token${shown.length === 1 ? '' : 's'} · value now`,
    stats: shown.slice(0, 3).map((h) => [h.symbol, usd(h.usd!)]),
    big: usd(s.totalUsd),
    line: change24h !== undefined ? `${pct(change24h)} · 24 h` : 'value now',
    source: `Read from Solana · proof ${code}`,
  };
}

/** Counts from a first look at every holding: tokens with a red flag, tokens with only things to watch. */
export function rugFlags(w: WatchResult): {
  risk: number;
  warn: number;
  first?: string;
} {
  const all = Object.values(w.assessed);
  const risky = all.filter((a) => a.signals.some((s) => s.level === 'risk'));
  const first =
    risky[0] ?? all.find((a) => a.signals.some((s) => s.level === 'warn'));
  const sig =
    first?.signals.find((s) => s.level === 'risk') ??
    first?.signals.find((s) => s.level === 'warn');
  return {
    risk: risky.length,
    warn: all.filter(
      (a) => !risky.includes(a) && a.signals.some((s) => s.level === 'warn'),
    ).length,
    first: first && sig ? `${first.symbol}: ${sig.text}` : undefined,
  };
}

export function rugCard(
  w: WatchResult,
  wallet: string,
  flags: { risk: number; warn: number; first?: string },
  code: string,
): CardModel {
  return {
    kind: 'rugcheck',
    title: `Wallet ${short(wallet)}`,
    sub: `Rug check · ${w.checked} token${w.checked === 1 ? '' : 's'} held`,
    stats: [
      ['Checked', String(w.checked)],
      ['To watch', String(flags.warn)],
      ['Red flags', String(flags.risk)],
    ],
    big: flags.risk
      ? `${flags.risk} red flag${flags.risk > 1 ? 's' : ''}`
      : 'No red flag',
    line: flags.first ?? 'Nothing to watch in these checks.',
    source: `Signals, not a guarantee · proof ${code}`,
    signals: true,
  };
}

/** The proof page for a PnL card: the method and every trade used, newest first. */
export function pnlProof(p: Pnl): Proof {
  const symbols = Object.fromEntries(p.tokens.map((t) => [t.mint, t.symbol]));
  return {
    method: METHOD,
    rows: p.ledger.map((t) => ({
      signature: t.signature,
      time:
        new Date(t.time).toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
      symbol: symbols[t.mint] ?? short(t.mint),
      side: t.side,
      detail: `${t.side === 'buy' ? 'paid' : 'received'} ${[t.sol ? `${t.sol.toLocaleString('en-US', { maximumFractionDigits: 6 })} SOL` : '', t.usd ? usd(t.usd) : ''].filter(Boolean).join(' + ')} for ${t.qty.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbols[t.mint] ?? short(t.mint)}`,
    })),
    note: [
      p.skipped
        ? `${p.skipped} token${p.skipped > 1 ? 's' : ''} sold in the period but bought before it ${p.skipped > 1 ? 'are' : 'is'} left out.`
        : '',
      p.complete ? '' : `Only the last ${p.trades} trades were read.`,
      `SOL at $${p.solUsd.toFixed(2)} when the card was made.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}
