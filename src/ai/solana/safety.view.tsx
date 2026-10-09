import { Card } from '@/components/ui/card';
import { type Level, type TokenCheck } from '@/lib/fonctions/check-token';
import { type TxExplanation } from '@/lib/fonctions/explain-tx';
import { amount } from '@/lib/fonctions/lib';
import { cn } from '@/lib/utils';

const LEVEL_WORD: Record<Level, string> = {
  ok: 'OK',
  warn: 'Watch',
  risk: 'Red flag',
};

/** A fixed UTC format: the same string on the server and in the browser, so no hydration gap. */
const utc = (t: string | number) =>
  `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const DOT: Record<Level, string> = {
  ok: 'bg-primary',
  warn: 'bg-pending',
  risk: 'bg-destructive',
};

function TokenCheckCard({ data }: { data: TokenCheck }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">{data.summary}</p>
      </div>
      <ul className="divide-y">
        {data.signals.map((s) => (
          <li
            key={s.key}
            className="flex items-start gap-3 px-4 py-2.5 text-sm"
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                DOT[s.level],
              )}
            />
            <span
              className={s.level === 'ok' ? 'text-muted-foreground' : undefined}
            >
              <span className="sr-only">{LEVEL_WORD[s.level]}: </span>
              {s.text}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        {data.disclaimer}
      </p>
    </Card>
  );
}

function TxCard({ data }: { data: TxExplanation }) {
  return (
    <Card className="overflow-hidden">
      <div className="space-y-1 border-b px-4 py-3">
        <p className="text-sm font-semibold">{data.sentence}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {data.time ? utc(data.time) : 'time unknown'} · signer{' '}
          {data.signer.slice(0, 4)}…{data.signer.slice(-4)}
        </p>
      </div>
      {data.changes.length > 0 && (
        <dl className="grid grid-cols-[1fr_auto] text-sm">
          {data.changes.map((c) => (
            <div key={c.mint} className="contents">
              <dt className="border-b px-4 py-2 text-muted-foreground">
                {c.symbol}
              </dt>
              <dd
                className={cn(
                  'border-b px-4 py-2 text-right font-mono tabular-nums',
                  c.delta > 0 && 'text-primary',
                )}
              >
                {c.delta > 0 ? '+' : c.delta < 0 ? '−' : ''}
                {amount(Math.abs(c.delta))}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <a
        href={data.explorer}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        View on Solscan <span aria-hidden="true">↗</span>
      </a>
    </Card>
  );
}

export const safetyToolViews = {
  checkTokenSafety: {
    displayName: 'Token check',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (raw: unknown) => {
      const r = raw as { success: boolean; data?: TokenCheck; error?: string };
      if (!r.success || !r.data)
        return <p className="text-sm text-destructive">{r.error}</p>;
      return <TokenCheckCard data={r.data} />;
    },
  },

  explainTransaction: {
    displayName: 'Explain transaction',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (raw: unknown) => {
      const r = raw as {
        success: boolean;
        data?: TxExplanation;
        error?: string;
      };
      if (!r.success || !r.data)
        return <p className="text-sm text-destructive">{r.error}</p>;
      return <TxCard data={r.data} />;
    },
  },
};
