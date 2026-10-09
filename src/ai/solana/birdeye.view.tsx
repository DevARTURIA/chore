import TopTrader from '@/components/top-trader';
import type { BirdeyeTrader } from '@/server/actions/birdeye';

export const birdeyeToolViews = {
  getTopTraders: {
    displayName: 'Top Traders',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (result: unknown) => {
      const typedResult = result as {
        success: boolean;
        data?: BirdeyeTrader[];
        error?: string;
      };

      if (!typedResult.success) {
        return (
          <div className="relative overflow-hidden rounded-2xl bg-destructive/5 p-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">
                Error: {typedResult.error}
              </p>
            </div>
          </div>
        );
      }

      if (!typedResult.data?.length) {
        return (
          <div className="relative overflow-hidden rounded-2xl bg-muted/50 p-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">No traders found</p>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {typedResult.data.map((trader, index) => (
            <TopTrader key={trader.address} trader={trader} rank={index + 1} />
          ))}
        </div>
      );
    },
  },
};
