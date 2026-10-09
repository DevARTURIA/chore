import { ImageResponse } from 'next/og';

import { SIZE, cardElement } from '@/lib/cards/render';
import type { CardModel } from '@/lib/fonctions/cards';
import { cardAssets, cardByCode, lookFrom } from '@/server/cards';

export const runtime = 'nodejs';

/** The card's image. What it says was fixed when it was made; only the look can change (?style=&sky=&format=). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const card = await cardByCode((await params).code);
  if (!card) return new Response('No card with this code.', { status: 404 });
  const look = lookFrom(card.look, new URL(req.url).searchParams);
  const { images, fonts } = await cardAssets();
  return new ImageResponse(
    cardElement(card.model as unknown as CardModel, look, images),
    {
      ...SIZE[look.format],
      fonts,
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
  );
}
