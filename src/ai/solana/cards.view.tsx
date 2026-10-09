import { Card } from '@/components/ui/card';

export interface CardResult {
  success: boolean;
  error?: string;
  data?: {
    code: string;
    page: string;
    image: string;
    title: string;
    big: string;
    line: string;
  };
}

export const cardToolViews = {
  shareCard: {
    displayName: 'Share card',
    isCollapsible: false,
    render: (raw: unknown) => {
      const r = raw as CardResult;
      if (!r.success || !r.data)
        return <p className="text-sm text-destructive">{r.error}</p>;
      const d = r.data;
      return (
        <Card className="grid gap-3 overflow-hidden p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={d.image}
            alt={`${d.title}, ${d.big}, ${d.line}`}
            className="h-auto w-full rounded-md border"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono text-muted-foreground">
              proof {d.code}
            </span>
            <a
              href={d.page}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto underline-offset-4 hover:underline"
            >
              Proof page and sharing <span aria-hidden="true">↗</span>
            </a>
          </div>
        </Card>
      );
    },
  },
};
