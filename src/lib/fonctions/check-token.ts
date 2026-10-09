// Tool: "Is this token safe?" Signals before a buy, never a guarantee.
// Authorities are read from the chain (ground truth); holders, dev share, liquidity,
// age and organic activity come from Jupiter's Tokens API.
import {
  type Env,
  type TokenInfo,
  ToolError,
  isAddress,
  rpc,
  short,
  tokenInfo,
  usd,
} from './lib';

export type Level = 'ok' | 'warn' | 'risk';

export interface Signal {
  key: string;
  level: Level;
  /** One sentence a holder understands. */
  text: string;
}

export interface TokenCheck {
  mint: string;
  name: string;
  symbol: string;
  verified: boolean;
  signals: Signal[];
  counts: Record<Level, number>;
  /** The sentence the agent leads with. Never says "safe". */
  summary: string;
  disclaimer: string;
}

export interface Authorities {
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

interface ParsedMint {
  value: null | { data: { parsed?: { type: string; info: Authorities } } };
}

// Thresholds: one place, so the review can tune them.
export const LIMITS = {
  topHoldersRisk: 50,
  topHoldersWarn: 25,
  devRisk: 10,
  devWarn: 3,
  liquidityRisk: 10_000,
  liquidityWarn: 50_000,
  youngHours: 24,
  fewHolders: 100,
};

export async function checkToken(
  env: Env,
  mint: string,
  now = Date.now(),
): Promise<TokenCheck> {
  if (!isAddress(mint))
    throw new ToolError('That is not a Solana token address.');

  const [chain, infos] = await Promise.all([
    rpc<ParsedMint>(env, 'getAccountInfo', [
      mint,
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]),
    tokenInfo(env, [mint]),
  ]);
  const parsed = chain.value?.data.parsed;
  if (!parsed || parsed.type !== 'mint')
    throw new ToolError(`${short(mint)} is not a token mint.`);
  const t: TokenInfo = infos[mint] ?? {
    id: mint,
    name: 'Unknown token',
    symbol: '?',
    decimals: 0,
  };
  const verified = t.isVerified === true;

  const s = assess(t, parsed.info, now);

  const counts: Record<Level, number> = { ok: 0, warn: 0, risk: 0 };
  for (const x of s) counts[x.level]++;
  const name = `${t.name} ($${t.symbol})`;
  const summary = counts.risk
    ? `${name}: ${counts.risk} red flag${counts.risk > 1 ? 's' : ''} and ${counts.warn} thing${counts.warn === 1 ? '' : 's'} to watch.`
    : counts.warn
      ? `${name}: no red flag, ${counts.warn} thing${counts.warn > 1 ? 's' : ''} to watch.`
      : `${name}: no red flag found in these checks.`;

  return {
    mint,
    name: t.name,
    symbol: t.symbol,
    verified,
    signals: s,
    counts,
    summary,
    disclaimer: 'Signals, not a guarantee. Information, not financial advice.',
  };
}

/** The signals for one token, from its Jupiter record and the authorities read on the chain. Pure: the
 * rug watch reuses it on every holding. */
export function assess(
  t: TokenInfo,
  authorities: Authorities,
  now = Date.now(),
): Signal[] {
  const verified = t.isVerified === true;
  const s: Signal[] = [];
  const add = (key: string, level: Level, text: string) =>
    s.push({ key, level, text });

  // Authorities: an active one is a real power over holders. Regulated stablecoins keep both on purpose.
  const { mintAuthority, freezeAuthority } = authorities;
  if (mintAuthority)
    add(
      'mint',
      verified ? 'warn' : 'risk',
      verified
        ? 'Its issuer can still mint more, as usual for a verified token of this kind.'
        : 'The creator can still mint more tokens and dilute holders.',
    );
  else
    add('mint', 'ok', 'No one can mint more: the mint authority is revoked.');
  if (freezeAuthority)
    add(
      'freeze',
      verified ? 'warn' : 'risk',
      verified
        ? 'Its issuer can freeze accounts, as usual for a verified token of this kind.'
        : 'The creator can freeze your tokens so you cannot sell.',
    );
  else
    add(
      'freeze',
      'ok',
      'No one can freeze holders: the freeze authority is revoked.',
    );

  const top = t.audit?.topHoldersPercentage;
  if (typeof top === 'number') {
    const pct = `${top.toFixed(1)}%`;
    if (top >= LIMITS.topHoldersRisk)
      add('holders', 'risk', `The top holders own ${pct} of the supply.`);
    else if (top >= LIMITS.topHoldersWarn)
      add('holders', 'warn', `The top holders own ${pct} of the supply.`);
    else
      add('holders', 'ok', `Supply is spread out: the top holders own ${pct}.`);
  }

  const dev = t.audit?.devBalancePercentage;
  if (typeof dev === 'number') {
    const pct = `${dev < 0.1 ? '<0.1' : dev.toFixed(1)}%`;
    if (dev >= LIMITS.devRisk)
      add('dev', 'risk', `The creator's wallet still holds ${pct}.`);
    else if (dev >= LIMITS.devWarn)
      add('dev', 'warn', `The creator's wallet holds ${pct}.`);
    else add('dev', 'ok', `The creator's wallet holds ${pct}.`);
  }
  if ((t.audit?.devMints ?? 0) >= 20)
    add(
      'serial',
      'warn',
      `The creator has launched ${t.audit!.devMints} tokens.`,
    );

  if (typeof t.liquidity === 'number') {
    if (t.liquidity < LIMITS.liquidityRisk)
      add(
        'liquidity',
        'risk',
        `Liquidity is thin (${usd(t.liquidity)}): a sale can move the price a lot.`,
      );
    else if (t.liquidity < LIMITS.liquidityWarn)
      add('liquidity', 'warn', `Liquidity is modest (${usd(t.liquidity)}).`);
    else add('liquidity', 'ok', `Liquidity is ${usd(t.liquidity)}.`);
  } else add('liquidity', 'warn', 'No liquidity found on Jupiter.');

  if (t.firstPool?.createdAt) {
    const hours = (now - Date.parse(t.firstPool.createdAt)) / 3_600_000;
    if (hours < LIMITS.youngHours)
      add(
        'age',
        'warn',
        `It started trading ${hours < 1 ? 'less than an hour' : `${Math.floor(hours)} hours`} ago.`,
      );
    else add('age', 'ok', `It has traded for ${Math.floor(hours / 24)} days.`);
  }

  if (typeof t.holderCount === 'number' && t.holderCount < LIMITS.fewHolders)
    add('count', 'warn', `Only ${t.holderCount} holders.`);
  if (t.organicScoreLabel === 'low')
    add('organic', 'warn', 'Most of its trading looks automated, not organic.');
  if (verified) add('verified', 'ok', 'Verified on Jupiter.');

  return s;
}
