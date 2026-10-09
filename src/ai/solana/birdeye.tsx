import 'server-only';
import { z } from 'zod';

import { BirdeyeTimeframe, getTopTraders } from '@/server/actions/birdeye';

export const birdeyeTools = {
  getTopTraders: {
    description: 'Get top traders on Solana DEXes given a timeframe',
    parameters: z.object({
      timeframe: z
        .nativeEnum(BirdeyeTimeframe)
        .describe('The timeframe to search for'),
    }),
    requiredEnvVars: ['BIRDEYE_API_KEY'],
    execute: async ({ timeframe }: { timeframe: BirdeyeTimeframe }) => {
      try {
        const traders = await getTopTraders({ timeframe });

        return {
          success: true,
          data: traders,
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to search traders',
        };
      }
    },
  },
};
