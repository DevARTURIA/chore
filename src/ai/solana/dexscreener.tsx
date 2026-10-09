import 'server-only';
import { z } from 'zod';

import type {
  DexScreenerOrder,
  DexScreenerPair,
  DexScreenerTokenProfile,
} from './dexscreener.view';

interface DexScreenerPairResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[];
}

export const dexscreenerTools = {
  getTokenOrders: {
    description:
      "Check if a token has paid for DexScreener promotional services. Use this to verify if a token has invested in marketing or visibility on DexScreener, which can indicate the team's commitment to marketing and visibility. Returns order types (tokenProfile, communityTakeover, etc.) and their statuses.",
    parameters: z.object({
      chainId: z
        .string()
        .describe("The blockchain identifier (e.g., 'solana', 'ethereum')"),
      tokenAddress: z.string().describe('The token address to check'),
    }),
    execute: async ({
      chainId,
      tokenAddress,
    }: {
      chainId: string;
      tokenAddress: string;
    }) => {
      try {
        const response = await fetch(
          `https://api.dexscreener.com/orders/v1/${chainId}/${tokenAddress}`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch token orders: ${response.statusText}`,
          );
        }

        const orders = (await response.json()) as DexScreenerOrder[];
        return {
          suppressFollowUp: true,
          data: orders,
        };
      } catch (error) {
        throw new Error(
          `Failed to get token orders: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  },
  getTokenProfile: {
    description:
      'Get comprehensive information about a token from DexScreener. Use this when users want to know more about a token, including its price, liquidity, market cap, and social links (Telegram, Twitter, Website). This is particularly useful for due diligence or when users ask about token details, social presence, or market metrics.',
    parameters: z.object({
      mint: z.string().describe("The token's mint/contract address to check"),
    }),
    execute: async ({ mint }: { mint: string }) => {
      try {
        const response = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
          {
            headers: { Accept: 'application/json' },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch token profile: ${response.statusText}`,
          );
        }

        const data = (await response.json()) as DexScreenerPairResponse;

        if (data.pairs === null || !data.pairs.length) {
          throw new Error('No pair data found');
        }

        // Use the first pair with the highest liquidity
        const sortedPairs = data.pairs.sort(
          (a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0),
        );
        return {
          suppressFollowUp: true,
          data: sortedPairs[0],
        };
      } catch (error) {
        return {
          suppressFollowUp: false,
          data: null,
        };
      }
    },
  },
  getLatestTokenProfiles: {
    description:
      'Get the latest token profiles from DexScreener, focusing on Solana tokens. This shows tokens with verified profiles including their descriptions, social links, and branding assets.',
    parameters: z.object({
      placeholder: z.string().optional(),
    }),
    execute: async () => {
      try {
        const response = await fetch(
          'https://api.dexscreener.com/token-profiles/latest/v1',
          {
            headers: { Accept: 'application/json' },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch token profiles: ${response.statusText}`,
          );
        }

        const profiles = (await response.json()) as DexScreenerTokenProfile[];

        // Return up to first 10 profiles for Solana
        const solanaProfiles = profiles
          .filter((p) => p.chainId === 'solana')
          .slice(0, 10);

        return {
          suppressFollowUp: true,
          data: solanaProfiles,
        };
      } catch (error) {
        throw new Error(
          `Failed to get token profiles: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  },
};
