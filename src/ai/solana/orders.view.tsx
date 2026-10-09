import { Card } from '@/components/ui/card';

export interface OrderResult {
  success: boolean;
  error?: string;
  data?: { id: string; txSignature: string; lines: [string, string][] };
}

function OrderCard({ title, result }: { title: string; result: OrderResult }) {
  if (!result.success || !result.data)
    return <p className="text-sm text-destructive">{result.error}</p>;
  return (
    <Card className="overflow-hidden">
      <p className="border-b px-4 py-3 text-sm font-semibold">{title}</p>
      <dl className="grid grid-cols-[auto_1fr] text-sm">
        {result.data.lines.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="border-b px-4 py-2 text-muted-foreground">{k}</dt>
            <dd className="border-b px-4 py-2 text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {result.data.txSignature && (
        <a
          href={`https://solscan.io/tx/${result.data.txSignature}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Deposit on Solscan <span aria-hidden="true">↗</span>
        </a>
      )}
    </Card>
  );
}

export const orderToolViews = {
  createLimitOrder: {
    displayName: 'Limit order',
    render: (raw: unknown) => (
      <OrderCard title="Limit order placed" result={raw as OrderResult} />
    ),
  },

  createExitOrder: {
    displayName: 'Exit plan',
    render: (raw: unknown) => (
      <OrderCard title="Exit plan placed" result={raw as OrderResult} />
    ),
  },

  createDcaOrder: {
    displayName: 'DCA',
    render: (raw: unknown) => (
      <OrderCard title="DCA started" result={raw as OrderResult} />
    ),
  },
};
