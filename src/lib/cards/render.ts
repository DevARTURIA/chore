// The share card as an element tree for next/og (satori): the footer's beach, the number in
// charcoal on the sand (Plage) or on black above a strip of beach (Nuit), wide for X or square
// for Telegram. Satori lays out with flexbox only: every box with several children is a flex box.
import { type ReactElement, createElement as h } from 'react';

import {
  type CardFormat,
  type CardModel,
  type CardSky,
  type CardStyle,
  MENTION,
} from '../fonctions/cards';

export interface CardImages {
  plageWide: string;
  plageSquare: string;
  bandWide: string;
  bandSquare: string;
  tile: string;
}

export const SIZE: Record<CardFormat, { width: number; height: number }> = {
  wide: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
};

const C = {
  sky: '#ECF1E9',
  sky2: '#AEB7AB',
  charcoal: '#1C1E1B',
  charcoal2: '#454B43',
  ink: '#0A0C0A',
  black: '#0A0C0A',
  faint: '#7D877A',
  muted: '#98A296',
};
const SANS = 'Schibsted Grotesk';
const MONO = 'IBM Plex Mono';

type Style = Record<string, string | number>;
const box = (style: Style, ...children: (ReactElement | string | null)[]) =>
  h(
    'div',
    { style: { display: 'flex', ...style } },
    ...children.filter((c) => c !== null),
  );
const text = (style: Style, s: string) =>
  h('div', { style: { display: 'flex', ...style } }, s);
const img = (src: string, style: Style) =>
  h('img', { src, style: { position: 'absolute', ...style } });

/** The PnL line. The mono face has no ▲ ▼: the arrow is drawn, the rest stays text. */
function line(style: Style, s: string) {
  const size = Number(style.fontSize);
  const up = s.startsWith('▲ '),
    down = s.startsWith('▼ ');
  if (!up && !down) return text(style, s);
  const color = String(style.color);
  const w = Math.round(size * 0.62),
    hgt = Math.round(size * 0.54);
  const pts = up
    ? `0,${hgt} ${w / 2},0 ${w},${hgt}`
    : `0,0 ${w},0 ${w / 2},${hgt}`;
  const svg = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}"><polygon points="${pts}" fill="${color}"/></svg>`)}`;
  return box(
    { alignItems: 'center', gap: Math.round(size * 0.36), ...style },
    h('img', { src: svg, width: w, height: hgt }),
    s.slice(2),
  );
}

function stats(
  pairs: [string, string][],
  size: number,
  color: string,
  label: string,
) {
  return box(
    { gap: 44 },
    ...pairs.map(([k, v]) =>
      box(
        { flexDirection: 'column', gap: 4 },
        text(
          { fontFamily: SANS, fontWeight: 600, fontSize: 19, color: label },
          k,
        ),
        text({ fontFamily: MONO, fontWeight: 500, fontSize: size, color }, v),
      ),
    ),
  );
}

/** The tile and "chore": the logo with the word, as on the site (tile = 1 em, gap 0.3 em). */
function logo(src: string, px: number, color: string) {
  return box(
    { alignItems: 'center', gap: Math.round(px * 0.3) },
    h('img', { src, width: px, height: px }),
    text(
      {
        fontFamily: SANS,
        fontWeight: 800,
        fontSize: px,
        letterSpacing: -0.03 * px,
        color,
        lineHeight: 1,
      },
      'chore',
    ),
  );
}

export function cardElement(
  m: CardModel,
  o: { style: CardStyle; sky: CardSky; format: CardFormat },
  im: CardImages,
): ReactElement {
  const { width, height } = SIZE[o.format];
  const pairs =
    o.sky === 'tokens' && m.movers?.length && o.style === 'plage'
      ? m.movers
      : m.stats;
  const who = (size: number) =>
    box(
      { flexDirection: 'column', gap: 10 },
      text(
        {
          fontFamily: SANS,
          fontWeight: 800,
          fontSize: size,
          letterSpacing: -0.03 * size,
          color: C.sky,
          whiteSpace: 'nowrap',
        },
        m.title,
      ),
      text(
        {
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 19,
          color: C.sky2,
          whiteSpace: 'nowrap',
        },
        m.sub,
      ),
    );
  const bigSize = (base: number) => (m.signals ? Math.round(base * 0.8) : base);
  const root = (style: Style, ...children: (ReactElement | null)[]) =>
    box(
      {
        position: 'relative',
        width,
        height,
        background: C.black,
        fontFamily: SANS,
        ...style,
      },
      ...children,
    );

  if (o.style === 'plage' && o.format === 'wide')
    return root(
      {},
      img(im.plageWide, { left: 0, top: 0, width, height }),
      box(
        {
          position: 'absolute',
          left: 56,
          right: 56,
          top: 46,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        },
        who(40),
        stats(pairs, 28, C.sky, C.sky2),
      ),
      text(
        {
          position: 'absolute',
          left: 50,
          top: 330,
          fontWeight: 800,
          fontSize: bigSize(172),
          letterSpacing: -0.055 * bigSize(172),
          color: C.charcoal,
          whiteSpace: 'nowrap',
          lineHeight: 1,
        },
        m.big,
      ),
      line(
        {
          position: 'absolute',
          left: 58,
          top: 500,
          right: 56,
          fontFamily: MONO,
          fontWeight: 600,
          fontSize: m.signals ? 26 : 34,
          color: C.charcoal,
        },
        m.line,
      ),
      box(
        {
          position: 'absolute',
          left: 56,
          right: 56,
          bottom: 26,
          alignItems: 'center',
          gap: 22,
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 16,
          color: C.charcoal2,
        },
        logo(im.tile, 26, C.ink),
        text({}, m.source),
        text({ marginLeft: 'auto' }, MENTION),
      ),
    );

  if (o.style === 'plage')
    return root(
      {},
      img(im.plageSquare, { left: 0, top: 0, width, height }),
      box(
        {
          position: 'absolute',
          left: 64,
          right: 64,
          top: 64,
          flexDirection: 'column',
          gap: 14,
        },
        who(48),
        box({ marginTop: 18 }, stats(pairs, 32, C.sky, C.sky2)),
      ),
      text(
        {
          position: 'absolute',
          left: 56,
          top: 590,
          fontWeight: 800,
          fontSize: bigSize(168),
          letterSpacing: -0.055 * bigSize(168),
          color: C.charcoal,
          whiteSpace: 'nowrap',
          lineHeight: 1,
        },
        m.big,
      ),
      line(
        {
          position: 'absolute',
          left: 64,
          right: 64,
          top: 770,
          fontFamily: MONO,
          fontWeight: 600,
          fontSize: m.signals ? 30 : 40,
          color: C.charcoal,
        },
        m.line,
      ),
      box(
        {
          position: 'absolute',
          left: 64,
          right: 64,
          bottom: 40,
          flexDirection: 'column',
          gap: 8,
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 18,
          color: C.charcoal2,
        },
        box(
          { alignItems: 'center', gap: 20 },
          logo(im.tile, 32, C.ink),
          text({}, m.source),
        ),
        text({}, MENTION),
      ),
    );

  const mention = (style: Style) =>
    box(
      {
        position: 'absolute',
        alignItems: 'center',
        gap: 22,
        fontFamily: MONO,
        fontWeight: 500,
        fontSize: 16,
        color: C.faint,
        ...style,
      },
      text({}, m.source),
      text({ marginLeft: 'auto' }, MENTION),
    );
  const word = (size: number, style: Style) =>
    text(
      {
        position: 'absolute',
        fontWeight: 800,
        fontSize: size,
        letterSpacing: -0.05 * size,
        color: C.charcoal,
        lineHeight: 0.8,
        ...style,
      },
      'chore',
    );

  if (o.format === 'wide')
    return root(
      {},
      box(
        {
          position: 'absolute',
          left: 56,
          right: 56,
          top: 52,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        },
        who(40),
        box(
          { flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
          text(
            {
              fontWeight: 800,
              fontSize: m.signals ? 76 : 92,
              letterSpacing: -0.05 * 92,
              color: C.sky,
              whiteSpace: 'nowrap',
              lineHeight: 1,
            },
            m.big,
          ),
          line(
            {
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: m.signals ? 20 : 30,
              color: C.sky,
              maxWidth: 560,
              textAlign: 'right',
            },
            m.line,
          ),
        ),
      ),
      box(
        { position: 'absolute', left: 56, top: 206 },
        stats(m.stats, 28, C.sky, C.sky2),
      ),
      mention({ left: 56, right: 56, bottom: 306 }),
      img(im.bandWide, { left: 0, bottom: 0, width, height: 288 }),
      word(150, { left: 40, bottom: 30 }),
    );

  return root(
    {},
    box(
      {
        position: 'absolute',
        left: 64,
        right: 64,
        top: 64,
        flexDirection: 'column',
        gap: 14,
      },
      who(48),
      text(
        {
          marginTop: 30,
          fontWeight: 800,
          fontSize: bigSize(150),
          letterSpacing: -0.05 * 150,
          color: C.sky,
          whiteSpace: 'nowrap',
          lineHeight: 1,
        },
        m.big,
      ),
      line(
        {
          fontFamily: MONO,
          fontWeight: 600,
          fontSize: m.signals ? 26 : 38,
          color: C.sky,
        },
        m.line,
      ),
      box({ marginTop: 22 }, stats(m.stats, 30, C.sky, C.sky2)),
    ),
    box(
      {
        position: 'absolute',
        left: 64,
        right: 64,
        bottom: 462,
        flexDirection: 'column',
        gap: 6,
        fontFamily: MONO,
        fontWeight: 500,
        fontSize: 18,
        color: C.faint,
      },
      text({}, m.source),
      text({}, MENTION),
    ),
    img(im.bandSquare, { left: 0, bottom: 0, width, height: 440 }),
    word(200, { left: 52, bottom: 60 }),
  );
}
