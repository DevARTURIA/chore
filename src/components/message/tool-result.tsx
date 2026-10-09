'use client';

import { useState } from 'react';

import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';

import { DefaultToolResultRenderer, getToolView } from '@/ai/tool-views';
import { cn } from '@/lib/utils';

interface ToolResultProps {
  toolName: string;
  result: unknown;
  header: React.ReactNode;
}

export function ToolResult({ toolName, result, header }: ToolResultProps) {
  const config = getToolView(toolName);
  // A step is one short line. Its card opens by default only when the card is the answer
  // (a tool with its own render); raw data from tools without one stays folded.
  const isCollapsible = config?.isCollapsible === true || !config?.render;
  const [isOpen, setIsOpen] = useState(
    config?.isExpandedByDefault ?? !isCollapsible,
  );

  const content = config?.render
    ? config?.render(result)
    : DefaultToolResultRenderer({ result });
  if (!content) return null;

  const headerContent = (
    <div className="flex w-full items-center gap-2">
      {header}
      {isCollapsible && (
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180 transform',
          )}
        />
      )}
    </div>
  );

  if (!isCollapsible) {
    return (
      <div className="mt-1 w-full">
        <div className="w-full py-1">{headerContent}</div>
        <div className="mt-1 text-sm sm:text-base">{content}</div>
      </div>
    );
  }

  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={setIsOpen}
      className="mt-1 w-full"
    >
      <Collapsible.Trigger className="w-full">
        <div className="w-full cursor-pointer rounded-md py-1 text-left transition-colors hover:text-foreground">
          {headerContent}
        </div>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="mt-1">{content}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
