// Tool: "Explain this transaction." A signature in, what happened to the signer out:
// SOL and token changes, the fee, the programs that did the work, one plain sentence.
import {
  type Env,
  PLUMBING,
  PROGRAMS,
  ToolError,
  amount,
  isSignature,
  rpc,
  short,
  tokenInfo,
} from './lib';

export interface Change {
  mint: string;
  symbol: string;
  /** Signed, in whole tokens (negative = left the wallet). */
  delta: number;
}

export interface TxExplanation {
  signature: string;
  ok: boolean;
  error?: string;
  time?: string;
  signer: string;
  feeSol: number;
  kind: 'swap' | 'transfer' | 'launch' | 'other';
  /** Named programs, plumbing left out. */
  via: string[];
  changes: Change[];
  sentence: string;
  explorer: string;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { uiAmount: number | null; decimals: number };
}
interface ParsedTx {
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    logMessages?: string[];
  } | null;
  transaction: {
    message: {
      accountKeys: { pubkey: string; signer: boolean }[];
      instructions: { programId: string }[];
    };
  };
}

const LAMPORTS = 1e9;
const SOL = 'So11111111111111111111111111111111111111112';

export async function explainTx(
  env: Env,
  signature: string,
): Promise<TxExplanation> {
  if (!isSignature(signature))
    throw new ToolError('That is not a Solana transaction signature.');
  const tx = await rpc<ParsedTx | null>(env, 'getTransaction', [
    signature,
    {
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    },
  ]);
  if (!tx || !tx.meta)
    throw new ToolError(
      'Transaction not found. It may be too recent, too old for this RPC, or on another network.',
    );

  const keys = tx.transaction.message.accountKeys;
  const si = keys.findIndex((k) => k.signer);
  const signer = keys[si].pubkey;
  const fee = tx.meta.fee / LAMPORTS;

  // Token deltas for accounts the signer owns, per mint.
  const byMint = new Map<string, { delta: number }>();
  const sum = (list: TokenBalance[] | undefined, sign: number) => {
    for (const b of list ?? []) {
      if (b.owner !== signer) continue;
      const cur = byMint.get(b.mint) ?? { delta: 0 };
      cur.delta += sign * (b.uiTokenAmount.uiAmount ?? 0);
      byMint.set(b.mint, cur);
    }
  };
  sum(tx.meta.preTokenBalances, -1);
  sum(tx.meta.postTokenBalances, 1);

  // Native SOL: the signer's balance change with the fee added back, merged with wrapped SOL.
  const solDelta =
    (tx.meta.postBalances[si] - tx.meta.preBalances[si]) / LAMPORTS + fee;
  const wsol = byMint.get(SOL);
  byMint.delete(SOL);
  const sol = solDelta + (wsol?.delta ?? 0);

  const mints = [...byMint.keys()];
  const meta = mints.length ? await tokenInfo(env, mints) : {};
  const changes: Change[] = [];
  // Ignore dust from rent and rounding (less than 0.00001 SOL).
  if (Math.abs(sol) >= 1e-5)
    changes.push({ mint: SOL, symbol: 'SOL', delta: sol });
  for (const [mint, { delta }] of byMint)
    if (Math.abs(delta) > 0)
      changes.push({ mint, symbol: meta[mint]?.symbol ?? short(mint), delta });

  const named = [
    ...new Set(
      tx.transaction.message.instructions
        .map((i) => PROGRAMS[i.programId])
        .filter(Boolean),
    ),
  ];
  const via = named.filter((p) => !PLUMBING.has(p));
  const logs = (tx.meta.logMessages ?? []).join('\n');
  const out = changes.filter((c) => c.delta < 0),
    inn = changes.filter((c) => c.delta > 0);

  let kind: TxExplanation['kind'] = 'other';
  if (via.includes('Pump.fun') && /Instruction: Create/.test(logs))
    kind = 'launch';
  else if (out.length && inn.length) kind = 'swap';
  else if (!via.length && changes.length === 1) kind = 'transfer';

  const list = (cs: Change[]) =>
    cs.map((c) => `${amount(Math.abs(c.delta))} ${c.symbol}`).join(' and ');
  const by = via.length ? ` via ${via.join(', ')}` : '';
  let sentence: string;
  if (tx.meta.err)
    sentence = `This transaction failed${by}. Nothing moved except the ${amount(fee)} SOL fee.`;
  else if (kind === 'swap')
    sentence = `Swapped ${list(out)} for ${list(inn)}${by}.`;
  else if (kind === 'launch')
    sentence = `Created a token on Pump.fun${inn.length ? ` and received ${list(inn)}` : ''}.`;
  else if (kind === 'transfer')
    sentence = out.length ? `Sent ${list(out)}.` : `Received ${list(inn)}.`;
  else if (changes.length)
    sentence = `${out.length ? `Sent ${list(out)}` : ''}${out.length && inn.length ? ', ' : ''}${inn.length ? `received ${list(inn)}` : ''}${by}.`;
  else sentence = `No balance changed for the signer${by}.`;
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (!tx.meta.err) sentence += ` Fee: ${amount(fee)} SOL.`;

  return {
    signature,
    ok: !tx.meta.err,
    error: tx.meta.err ? JSON.stringify(tx.meta.err) : undefined,
    time: tx.blockTime
      ? new Date(tx.blockTime * 1000).toISOString()
      : undefined,
    signer,
    feeSol: fee,
    kind,
    via,
    changes,
    sentence,
    explorer: `https://solscan.io/tx/${signature}`,
  };
}
