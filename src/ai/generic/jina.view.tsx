import { ExternalLink } from 'lucide-react';

import { cn } from '@/lib/utils';

// Types
interface JinaWebReaderResponse {
  content: string;
  url: string;
}

// Components
const WebContent = ({
  content,
  className,
}: {
  content: JinaWebReaderResponse;
  className?: string;
}) => {
  const wordCount = content.content.split(/\s+/).length;
  const charCount = content.content.length;

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-border/50 bg-background/50 p-3 shadow-sm transition-colors hover:border-border/80 hover:bg-background/80',
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <a
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm font-medium text-foreground/80 hover:text-foreground"
        >
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          {content.url}
        </a>
        <div className="flex items-center gap-4 text-xs text-muted-foreground/90">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Characters:</span>
            <span>{charCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Words:</span>
            <span>{wordCount.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Tools Export
export const jinaToolViews = {
  readWebPage: {
    displayName: 'Read Web Page',
    isCollapsible: true,
    render: (raw: unknown) => {
      const result = raw as { data: JinaWebReaderResponse };
      return <WebContent content={result.data} />;
    },
  },
};
