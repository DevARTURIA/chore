import 'server-only';
import { z } from 'zod';

import { getMintAccountInfo } from '@/lib/solana/helius';
import { analyzeMintBundles } from '@/server/actions/bundle';
import { type BundleAnalysisResponse } from '@/types/bundle';

function mapTokenDecimals(
  data: BundleAnalysisResponse,
  decimals: number,
): void {
  const tokenKeys = [
    'total_tokens',
    'tokens',
    'total_tokens_bundled',
    'distributed_amount',
    'holding_amount',
    'total_holding_amount',
  ];

  function adjustValue(value: any): any {
    return typeof value === 'number' ? value / Math.pow(10, decimals) : value;
  }

  function traverse(obj: any): void {
    if (typeof obj !== 'object' || obj === null) return;

    for (const key of Object.keys(obj)) {
      if (tokenKeys.includes(key) && typeof obj[key] === 'number') {
        obj[key] = adjustValue(obj[key]);
      } else if (typeof obj[key] === 'object') {
        traverse(obj[key]);
      }
    }
  }

  traverse(data);
}

export const bundleTools = {
  analyzeBundles: {
    description:
      'Analyze potential bundles and snipers for a given mint address.',
    parameters: z.object({
      mintAddress: z.string().describe("The token's mint address"),
    }),
    execute: async ({ mintAddress }: { mintAddress: string }) => {
      try {
        const analysis = await analyzeMintBundles({ mintAddress });

        if (!analysis?.data) {
          return {
            success: false,
            error:
              'Unable to fetch data. Please make sure it is a pump.fun launch.',
          };
        }

        // Get mint info for calculating decimals
        const accountInfo = await getMintAccountInfo(mintAddress);

        // Recalculate token fields using decimals from mint info
        if (analysis.data.data) {
          mapTokenDecimals(analysis.data.data, accountInfo.decimals);
        }

        return {
          success: true,
          data: {
            mintAddress,
            analysis: analysis.data.data,
          },
          suppressFollowUp: true,
        };
      } catch (error) {
        return {
          success: false,
          error:
            'Unable to fetch data. Please make sure it is a pump.fun launch.',
        };
      }
    },
  },
};
