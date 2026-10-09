import { LaunchResult } from '@/components/message/pumpfun-launch';
import { Card } from '@/components/ui/card';

export const pumpfunToolViews = {
  launchToken: {
    displayName: 'Deploy new token',
    render: (result: unknown) => {
      const typedResult = result as {
        success: boolean;
        data: any;
        error?: string;
      };

      if (!typedResult.success) {
        return (
          <Card className="bg-destructive/10 p-6">
            <h2 className="mb-2 text-xl font-semibold text-destructive">
              Launch Failed
            </h2>
            <pre className="text-sm text-destructive/80">
              {JSON.stringify(typedResult, null, 2)}
            </pre>
          </Card>
        );
      }

      const data = typedResult.data as {
        signature: string;
        mint: string;
        metadataUri: string;
      };
      return <LaunchResult {...data} />;
    },
  },
};
