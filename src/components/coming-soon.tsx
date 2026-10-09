import { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ComingSoonPageProps {
  icon: LucideIcon;
  title?: string;
  className?: string;
}

export function ComingSoonPage({
  icon: Icon,
  title = 'Coming soon',
  className,
}: ComingSoonPageProps) {
  return (
    <div
      className={cn(
        'flex min-h-[80vh] w-full flex-col items-center justify-center gap-6 px-4 text-center',
        className,
      )}
    >
      <Icon className="h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="max-w-[500px] text-muted-foreground">
          Not available yet.
        </p>
      </div>
    </div>
  );
}
