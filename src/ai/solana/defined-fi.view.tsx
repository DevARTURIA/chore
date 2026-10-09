import { TokenGrid } from '@/components/message/token-grid';

export const definedToolViews = {
  filterTrendingTokens: {
    displayName: 'Trending Tokens',
    render: (raw: unknown) => {
      const result = (raw as { data: any }).data;
      return (
        <TokenGrid
          tokens={Array.isArray(result) ? result : []}
          className="mt-3"
          isLoading={!Array.isArray(result)}
        />
      );
    },
  },
};
