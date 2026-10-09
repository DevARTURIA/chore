import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import 'server-only';

import type { CardImages } from '@/lib/cards/render';
import { RPC_URL } from '@/lib/constants';
import {
  type CardFormat,
  type CardKind,
  type CardModel,
  type CardSky,
  type CardStyle,
  type Proof,
  holdingsCard,
  pnlProof,
  rugCard,
  rugFlags,
  tokenCard,
  walletCard,
} from '@/lib/fonctions/cards';
import { watchHoldings } from '@/lib/fonctions/holdings-watch';
import { snapshot } from '@/lib/fonctions/wallet-digest';
import { type Period, walletPnl } from '@/lib/fonctions/wallet-pnl';
import prisma from '@/lib/prisma';

export interface Look {
  style: CardStyle;
  sky: CardSky;
  format: CardFormat;
}

export const DEFAULT_LOOK: Look = {
  style: 'plage',
  sky: 'stats',
  format: 'wide',
};

const env = () => ({
  rpcUrl: RPC_URL,
  jupiterApiKey: process.env.JUPITER_API_KEY || undefined,
});

// No 0/O, 1/I/L: a code read aloud or retyped stays right.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function newCode(): string {
  return [...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export interface CardRequest {
  kind: CardKind;
  period?: Period;
  mint?: string;
  look?: Partial<Look>;
}

/** Computes a card from the chain for this user's wallet and keeps it. Nothing comes from the user but the choices. */
export async function makeCard(
  userId: string,
  wallet: string,
  req: CardRequest,
) {
  const code = newCode();
  const e = env();
  let model: CardModel;
  let proof: Proof;
  if (req.kind === 'wallet' || req.kind === 'token') {
    if (req.kind === 'token' && !req.mint)
      throw new Error('Say which token the card is about.');
    const period = req.kind === 'token' ? 'all' : (req.period ?? '7d');
    const pnl = await walletPnl(e, wallet, period, {
      mint: req.kind === 'token' ? req.mint : undefined,
    });
    model =
      req.kind === 'wallet'
        ? walletCard(pnl, period, code)
        : tokenCard(pnl, req.mint!, code);
    proof = pnlProof(pnl);
  } else if (req.kind === 'holdings') {
    const s = await snapshot(e, wallet);
    const now = s.holdings.reduce((t, h) => t + (h.usd ?? 0), 0);
    const then = s.holdings.reduce((t, h) => t + (h.usd24h ?? h.usd ?? 0), 0);
    model = holdingsCard(
      s,
      code,
      then > 0 ? ((now - then) / then) * 100 : undefined,
    );
    proof = {
      method: [
        'Balances read from Solana for SOL and every token account of the wallet, priced with Jupiter when the card was made. Tokens worth less than $1 are left out.',
      ],
      rows: [],
      note: `Read at ${s.at.replace('T', ' ').slice(0, 16)} UTC.`,
    };
  } else {
    const w = await watchHoldings(e, wallet);
    model = rugCard(w, wallet, rugFlags(w), code);
    proof = {
      method: [
        'Every token held, except SOL and stablecoins, is checked: mint and freeze authority read from Solana; holders, creator share, liquidity, age and organic activity from Jupiter.',
        'Signals, not a guarantee.',
      ],
      rows: Object.entries(w.assessed).flatMap(([mint, a]) =>
        a.signals
          .filter((s) => s.level !== 'ok')
          .map((s) => ({
            signature: mint,
            time: '',
            symbol: a.symbol,
            side: 'held' as const,
            detail: `${s.level === 'risk' ? 'Red flag' : 'To watch'}: ${s.text}`,
          })),
      ),
    };
  }
  const look = { ...DEFAULT_LOOK, ...req.look };
  await prisma.shareCard.create({
    data: {
      id: code,
      userId,
      wallet,
      kind: req.kind,
      model: model as object,
      proof: proof as object,
      look: look as object,
    },
  });
  return { code, model, look };
}

export async function cardByCode(code: string) {
  if (!/^[2-9A-Z]{6}$/.test(code)) return null;
  return prisma.shareCard.findUnique({ where: { id: code } });
}

/** Reads `?style=&sky=&format=` over the look the card was made with; anything else is ignored. */
export function lookFrom(
  base: unknown,
  q: URLSearchParams | Record<string, string | undefined>,
): Look {
  const get = (k: string) =>
    (q instanceof URLSearchParams ? q.get(k) : q[k]) ?? undefined;
  const b = { ...DEFAULT_LOOK, ...(base as Partial<Look>) };
  const pick = <T extends string>(k: string, ok: readonly T[], d: T) => {
    const v = get(k);
    return v && (ok as readonly string[]).includes(v) ? (v as T) : d;
  };
  return {
    style: pick('style', ['plage', 'nuit'] as const, b.style),
    sky: pick('sky', ['stats', 'tokens'] as const, b.sky),
    format: pick('format', ['wide', 'square'] as const, b.format),
  };
}

let assets: Promise<{
  images: CardImages;
  fonts: {
    name: string;
    data: Buffer;
    weight: 500 | 600 | 800;
    style: 'normal';
  }[];
}> | null = null;

/** Backgrounds, tile and fonts, read once from src/assets/cards (traced into the route by next.config). */
export function cardAssets() {
  assets ??= (async () => {
    const dir = join(process.cwd(), 'src/assets/cards');
    const data = async (f: string, mime: string) =>
      `data:${mime};base64,${(await readFile(join(dir, f))).toString('base64')}`;
    const font = async (name: string, f: string, weight: 500 | 600 | 800) => ({
      name,
      data: await readFile(join(dir, f)),
      weight,
      style: 'normal' as const,
    });
    const [plageWide, plageSquare, bandWide, bandSquare, tile, ...fonts] =
      await Promise.all([
        data('plage-1200x630.jpg', 'image/jpeg'),
        data('plage-1080.jpg', 'image/jpeg'),
        data('bande-1200x288.jpg', 'image/jpeg'),
        data('bande-1080x440.jpg', 'image/jpeg'),
        data('tuile.svg', 'image/svg+xml'),
        font('Schibsted Grotesk', 'schibsted-grotesk-600.ttf', 600),
        font('Schibsted Grotesk', 'schibsted-grotesk-800.ttf', 800),
        font('IBM Plex Mono', 'ibm-plex-mono-500.ttf', 500),
        font('IBM Plex Mono', 'ibm-plex-mono-600.ttf', 600),
      ]);
    return {
      images: {
        plageWide,
        plageSquare,
        bandWide,
        bandSquare,
        tile,
      } as CardImages,
      fonts: fonts as Awaited<ReturnType<typeof font>>[],
    };
  })();
  return assets;
}
