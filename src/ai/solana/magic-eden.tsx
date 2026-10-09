import 'server-only';
import { z } from 'zod';

import type {
  MagicEdenActivity,
  MagicEdenCollection,
  MagicEdenStats,
} from './magic-eden.view';

// Components

// Tools Export
export const magicEdenTools = {
  getCollectionStats: {
    description:
      'Get detailed statistics for a Magic Eden collection including floor price, listed count, average price, and total volume.',
    parameters: z.object({
      symbol: z.string().describe('The collection symbol/slug to check'),
    }),
    execute: async ({ symbol }: { symbol: string }) => {
      try {
        const response = await fetch(
          `https://api-mainnet.magiceden.dev/v2/collections/${symbol}/stats`,
          { headers: { Accept: 'application/json' } },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch collection stats: ${response.statusText}`,
          );
        }

        const data = (await response.json()) as MagicEdenStats;
        return {
          suppressFollowUp: true,
          data,
        };
      } catch (error) {
        throw new Error(
          `Failed to get collection stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  },

  getCollectionActivities: {
    description:
      'Get recent trading activities for a Magic Eden collection including bids, listings, and sales.',
    parameters: z.object({
      symbol: z.string().describe('The collection symbol/slug to check'),
    }),
    execute: async ({ symbol }: { symbol: string }) => {
      try {
        const response = await fetch(
          `https://api-mainnet.magiceden.dev/v2/collections/${symbol}/activities`,
          { headers: { Accept: 'application/json' } },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch collection activities: ${response.statusText}`,
          );
        }

        const data = (await response.json()) as MagicEdenActivity[];
        // Only return the most recent 10 activities
        return {
          suppressFollowUp: true,
          data: data.slice(0, 10),
        };
      } catch (error) {
        throw new Error(
          `Failed to get collection activities: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  },

  getPopularCollections: {
    description:
      'Get the most popular collections on Magic Eden based on volume and activity.',
    parameters: z.object({
      timeRange: z
        .enum(['1h', '1d', '7d', '30d'])
        .describe('Time range for popularity metrics'),
    }),
    execute: async ({
      timeRange,
      limit,
    }: {
      timeRange: string;
      limit: number;
    }) => {
      try {
        const response = await fetch(
          `https://api-mainnet.magiceden.dev/v2/marketplace/popular_collections?time_range=${timeRange}&limit=50`,
          { headers: { Accept: 'application/json' } },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch popular collections: ${response.statusText}`,
          );
        }

        const data = (await response.json()) as MagicEdenCollection[];

        // Remove duplicate collections (same symbol)
        const uniqueCollections = data.filter(
          (collection, index, self) =>
            index === self.findIndex((c) => c.symbol === collection.symbol),
        );

        return {
          suppressFollowUp: true,
          data: uniqueCollections.slice(0, limit),
        };
      } catch (error) {
        throw new Error(
          `Failed to get popular collections: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  },
};
