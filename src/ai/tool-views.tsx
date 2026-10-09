import { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

import { actionToolViews } from './generic/action.view';
import { jinaToolViews } from './generic/jina.view';
import { telegramToolViews } from './generic/telegram.view';
import { utilToolViews } from './generic/util.view';
import { birdeyeToolViews } from './solana/birdeye.view';
import { bundleToolViews } from './solana/bundle.view';
import { cardToolViews } from './solana/cards.view';
import { chartToolViews } from './solana/chart.view';
import { cookieToolViews } from './solana/cookie.view';
import { definedToolViews } from './solana/defined-fi.view';
import { dexscreenerToolViews } from './solana/dexscreener.view';
import { jupiterToolViews } from './solana/jupiter.view';
import { magicEdenToolViews } from './solana/magic-eden.view';
import { orderToolViews } from './solana/orders.view';
import { pumpfunToolViews } from './solana/pumpfun.view';
import { safetyToolViews } from './solana/safety.view';
import { solanaToolViews } from './solana/solana.view';
import { watchToolViews } from './solana/watch.view';

/**
 * How the chat shows a tool call: the browser side of each tool. The definitions that run
 * (parameters, execute) stay on the server in providers.tsx; every tool there has an entry here.
 */
export interface ToolView {
  displayName?: string;
  icon?: ReactNode;
  isCollapsible?: boolean;
  isExpandedByDefault?: boolean;
  render?: (result: unknown) => React.ReactNode | null;
}

export function DefaultToolResultRenderer({ result }: { result: unknown }) {
  if (result && typeof result === 'object' && 'error' in result) {
    return (
      <Card className="bg-card p-4">
        <div className="pl-3.5 text-sm">
          {String((result as { error: unknown }).error)}
        </div>
      </Card>
    );
  }

  return (
    <div className="mt-2 border-l border-border/40 pl-3.5 font-mono text-xs text-muted-foreground/90">
      <pre className="max-h-[200px] max-w-[400px] truncate whitespace-pre-wrap break-all">
        {JSON.stringify(result, null, 2).trim()}
      </pre>
    </div>
  );
}

// Same order as defaultTools in providers.tsx.
const toolViews: Record<string, ToolView> = {
  ...actionToolViews,
  ...solanaToolViews,
  ...definedToolViews,
  ...pumpfunToolViews,
  ...jupiterToolViews,
  ...dexscreenerToolViews,
  ...magicEdenToolViews,
  ...jinaToolViews,
  ...utilToolViews,
  ...chartToolViews,
  ...telegramToolViews,
  ...bundleToolViews,
  ...birdeyeToolViews,
  ...cookieToolViews,
  ...safetyToolViews,
  ...watchToolViews,
  ...orderToolViews,
  ...cardToolViews,
};

export function getToolView(toolName: string): ToolView | undefined {
  return toolViews[toolName];
}
