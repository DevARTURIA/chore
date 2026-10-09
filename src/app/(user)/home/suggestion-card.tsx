import { motion } from 'framer-motion';

import type { Suggestion } from './data/suggestions';

interface SuggestionCardProps extends Suggestion {
  /** @default 0 */
  delay?: number;
  /** @default false */
  useSubtitle?: boolean;
  onSelect: (text: string) => void;
}

export function SuggestionCard({
  title,
  subtitle,
  delay = 0,
  useSubtitle = false,
  onSelect,
}: SuggestionCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      onClick={() => onSelect(useSubtitle ? subtitle : title)}
      className="flex flex-col gap-1 rounded-xl border bg-card p-3.5 text-left transition-colors duration-200 hover:border-muted-foreground/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="w-full truncate text-sm font-medium">{title}</span>
      <span className="w-full truncate text-xs text-muted-foreground">
        {subtitle}
      </span>
    </motion.button>
  );
}
