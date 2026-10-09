import { Card } from '@/components/ui/card';

// Both tools are meant for scheduled actions: the action's description tells the agent to call
// them, then to send the message on Telegram only when there is something to say.
export const watchToolViews = {
  watchHoldings: {
    displayName: 'Rug watch',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (raw: unknown) => {
      const r = raw as {
        success: boolean;
        data?: { message: string };
        error?: string;
      };
      if (!r.success || !r.data)
        return <p className="text-sm text-destructive">{r.error}</p>;
      return (
        <Card className="px-4 py-3">
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {r.data.message}
          </pre>
        </Card>
      );
    },
  },

  checkPriceAlert: {
    displayName: 'Price alert',
    isCollapsible: true,
  },

  getWalletDigest: {
    displayName: 'Wallet digest',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (raw: unknown) => {
      const r = raw as {
        success: boolean;
        data?: { message: string };
        error?: string;
      };
      if (!r.success || !r.data)
        return <p className="text-sm text-destructive">{r.error}</p>;
      return (
        <Card className="px-4 py-3">
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {r.data.message}
          </pre>
        </Card>
      );
    },
  },
};
