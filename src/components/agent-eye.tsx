'use client';

import { useEffect, useState } from 'react';

import { type Etat, type Image } from '@/config/marque';

import { AgentMark } from './logo';

// MARQUE.md, « Les états »: reading scans (demi, oeil, gauche, droite);
// at rest the eye blinks now and then (demi, cligne), never the four sparks.
const LECTURE: Image[] = ['demi', 'oeil', 'gauche', 'droite'];
const CLIGNE: Image[] = ['demi', 'cligne', 'demi'];

/** The agent mark, alive: it reads while working and blinks at rest. */
export function AgentEye({
  etat = 'repos',
  size = 32,
  className,
  title,
}: {
  etat?: Etat;
  size?: number;
  className?: string;
  title?: string;
}) {
  const [image, setImage] = useState<Image | null>(null);

  useEffect(() => {
    setImage(null);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;

    if (etat === 'lit') {
      let i = 0;
      const tick = () => {
        if (stopped) return;
        setImage(LECTURE[i % LECTURE.length]);
        i += 1;
        timers.push(setTimeout(tick, 420));
      };
      tick();
    } else if (etat === 'repos') {
      const blink = () => {
        if (stopped) return;
        CLIGNE.forEach((img, k) =>
          timers.push(setTimeout(() => !stopped && setImage(img), k * 70)),
        );
        timers.push(
          setTimeout(() => !stopped && setImage(null), CLIGNE.length * 70),
        );
        timers.push(setTimeout(blink, 4000 + Math.random() * 3000));
      };
      timers.push(setTimeout(blink, 2500 + Math.random() * 2000));
    }

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
  }, [etat]);

  return (
    <AgentMark
      etat={etat}
      image={image ?? undefined}
      size={size}
      className={className}
      title={title}
    />
  );
}
