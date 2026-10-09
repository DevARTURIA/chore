import { cn } from '@/lib/utils';

/** chore's waiting mark: a 3 × 3 pixel grid lit along the diagonal. Decorative: the text next
 * to it says what is happening. Stills under reduced motion. */
export function PixelLoader({
  size = 10,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('pixel-loader text-primary', className)}
      style={{ width: size, height: size }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          style={{
            animationDelay: `${(Math.floor(i / 3) + (i % 3)) * 0.12}s`,
          }}
        />
      ))}
    </span>
  );
}

/** A card that is still loading: an avatar, a title line and two text lines. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('grid gap-2.5 p-4', className)}>
      <div className="flex items-center gap-2.5">
        <span className="skeleton-bar h-8 w-8 shrink-0" />
        <span
          className="skeleton-bar h-3 flex-1"
          style={{ animationDelay: '0.2s' }}
        />
      </div>
      <span className="skeleton-bar h-2" style={{ animationDelay: '0.4s' }} />
      <span
        className="skeleton-bar h-2 w-4/5"
        style={{ animationDelay: '0.6s' }}
      />
    </div>
  );
}
