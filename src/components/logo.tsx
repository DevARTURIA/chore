import Link from 'next/link';

import { brand } from '@/config/brand';
import { ETATS, type Etat, type Image, MARQUE, TRACES } from '@/config/marque';
import { cn } from '@/lib/utils';

/**
 * The agent: the green tile and its eye. The eye is the state of the agent
 * (resting, reading, waiting for your confirmation, denied), never decoration.
 */
export function AgentMark({
  etat = 'repos',
  image,
  size = 32,
  className,
  title,
}: {
  etat?: Etat;
  /** A frame of the eye (blink, reading scan); defaults to the state's image. */
  image?: Image;
  size?: number;
  className?: string;
  title?: string;
}) {
  const { vue, rayon, couleurs } = MARQUE;
  return (
    <svg
      viewBox={`0 0 ${vue} ${vue}`}
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      data-etat={etat}
      className={cn('shrink-0 select-none', className)}
    >
      {title && <title>{title}</title>}
      <rect width={vue} height={vue} rx={rayon} fill={couleurs.tuile} />
      <path
        fill={couleurs.encre}
        fillRule="evenodd"
        d={TRACES[image ?? ETATS[etat]]}
      />
    </svg>
  );
}

export default function Logo({
  width = 32,
  etat = 'repos',
  className,
}: {
  width?: number;
  etat?: Etat;
  className?: string;
}) {
  return (
    <AgentMark
      size={width}
      etat={etat}
      className={className}
      title={brand.name}
    />
  );
}

/** The logo with the word: the tile is 1em of the word, 0.3em apart. */
export function Wordmark({
  size = 18,
  etat = 'repos',
  className,
}: {
  size?: number;
  etat?: Etat;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[0.3em] leading-none',
        className,
      )}
      style={{ fontSize: size, letterSpacing: MARQUE.interlettrage }}
    >
      <AgentMark size={size} etat={etat} />
      <span className="font-sans font-extrabold normal-case">{brand.name}</span>
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={className} aria-label={brand.name}>
      <Wordmark size={20} />
    </Link>
  );
}
