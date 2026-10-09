import Image from 'next/image';

import { Placeholder } from '@/lib/placeholder';
import type { TokenPrice } from '@/server/actions/jupiter';

// Types
interface JupiterToken {
  address: string;
  name: string;
  symbol: string;
  logoURI: string | null;
}

function TokenCard({ token }: { token: JupiterToken }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-muted/50 p-4">
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl">
          <Image
            src={
              token.logoURI ||
              Placeholder.generate({ width: 40, height: 40, text: 'Token' })
            }
            alt={token.name}
            className="object-cover"
            fill
            sizes="40px"
            onError={(e) => {
              (e.target as HTMLImageElement).src = Placeholder.generate({
                width: 40,
                height: 40,
                text: token.symbol,
              });
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-medium">{token.name}</h3>
            <span className="shrink-0 rounded-md bg-background/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {token.symbol}
            </span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">
              {token.address.slice(0, 4)}...{token.address.slice(-4)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceCard({
  token,
  price,
}: {
  token: JupiterToken;
  price: TokenPrice;
}) {
  const priceValue = parseFloat(price.price);

  const formattedPrice =
    priceValue < 1 ? priceValue.toFixed(6) : priceValue.toFixed(2);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-muted/50 p-4">
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl">
          <Image
            src={token.logoURI || '/placeholder.png'}
            alt={token.name}
            className="object-cover"
            fill
            sizes="40px"
            onError={(e) => {
              // @ts-expect-error - Type 'string' is not assignable to type 'never'
              e.target.src =
                'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-medium">{token.name}</h3>
            <span className="shrink-0 rounded-md bg-background/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {token.symbol}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-semibold">${formattedPrice}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const jupiterToolViews = {
  searchToken: {
    displayName: 'Search Token',
    isCollapsible: true,
    render: (result: unknown) => {
      const typedResult = result as {
        success: boolean;
        data?: JupiterToken[];
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
              <p className="text-sm text-muted-foreground">No tokens found</p>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {typedResult.data.map((token) => (
            <TokenCard key={token.address} token={token} />
          ))}
        </div>
      );
    },
  },

  getTokenPrice: {
    displayName: 'Get Token Price',
    isCollapsible: true,
    render: (result: unknown) => {
      const typedResult = result as {
        success: boolean;
        data?: {
          token: JupiterToken;
          price: TokenPrice;
        };
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

      if (!typedResult.data) {
        return (
          <div className="relative overflow-hidden rounded-2xl bg-muted/50 p-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                No price data available
              </p>
            </div>
          </div>
        );
      }

      return (
        <PriceCard
          token={typedResult.data.token}
          price={typedResult.data.price}
        />
      );
    },
  },
};
