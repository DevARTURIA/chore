import 'server-only';
import { z } from 'zod';

import {
  getJupiterTokenPrice,
  searchJupiterTokens,
} from '@/server/actions/jupiter';

export const jupiterTools = {
  searchToken: {
    description:
      'Search for any Solana token by name or symbol to get its contract address (mint), along with detailed information like volume and logo. Useful for getting token addresses for further operations.',
    parameters: z.object({
      query: z.string().describe('Token name or symbol to search for'),
    }),
    execute: async ({ query }: { query: string }) => {
      try {
        const tokens = await searchJupiterTokens(query);
        const searchQuery = query.toLowerCase();

        // Search and rank tokens
        const results = tokens
          .filter(
            (token) =>
              token.name.toLowerCase().includes(searchQuery) ||
              token.symbol.toLowerCase().includes(searchQuery),
          )
          .sort((a, b) => {
            // Exact matches first
            const aExact =
              a.symbol.toLowerCase() === searchQuery ||
              a.name.toLowerCase() === searchQuery;
            const bExact =
              b.symbol.toLowerCase() === searchQuery ||
              b.name.toLowerCase() === searchQuery;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            return 0;
          })
          .slice(0, 1);

        return {
          success: true,
          data: results,
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to search tokens',
        };
      }
    },
  },

  getTokenPrice: {
    description:
      'Get the current price of any Solana token in USDC, including detailed information like buy/sell prices and confidence level.',
    parameters: z.object({
      tokenAddress: z.string().describe("The token's mint address"),
      showExtraInfo: z
        .boolean()
        .default(true)
        .describe(
          'Whether to show additional price information like buy/sell prices and confidence level',
        ),
    }),
    execute: async ({
      tokenAddress,
      showExtraInfo,
    }: {
      tokenAddress: string;
      showExtraInfo: boolean;
    }) => {
      try {
        const token = await searchJupiterTokens(tokenAddress);
        if (!token.length) {
          return {
            success: false,
            error: 'Token not found',
          };
        }

        const price = await getJupiterTokenPrice(tokenAddress, showExtraInfo);
        if (!price) {
          return {
            success: false,
            error: 'Price data not available',
          };
        }

        return {
          success: true,
          data: {
            token: token[0],
            price,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to get token price',
        };
      }
    },
  },
};
