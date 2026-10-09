import 'server-only';
import { z } from 'zod';

import { retrieveAgentKit } from '@/server/actions/ai';

export const pumpfunTools = {
  launchToken: {
    agentKit: null,
    description: 'Launch a token on PumpFun (requires confirmation)',
    parameters: z.object({
      requiresConfirmation: z.boolean().optional().default(true),
      name: z.string().describe('The name of the token'),
      symbol: z.string().describe('The symbol of the token'),
      description: z.string().describe('The description of the token'),
      image: z.string().describe('The image of the token'),
      initalBuySOL: z.number().describe('The amount of SOL to buy the token'),
      website: z.string().optional().describe('The website url of the token'),
      twitter: z.string().optional().describe('The twitter url of the token'),
      telegram: z.string().optional().describe('The telegram url of the token'),
    }),
    execute: async function ({
      name,
      symbol,
      description,
      image,
      initalBuySOL,
      website,
      twitter,
      telegram,
    }: {
      name: string;
      symbol: string;
      description: string;
      image: string;
      initalBuySOL: number;
      website?: string;
      twitter?: string;
      telegram?: string;
    }) {
      try {
        const agent =
          this.agentKit ||
          (await retrieveAgentKit(undefined))?.data?.data?.agent;

        if (!agent) {
          return { success: false, error: 'Failed to retrieve agent' };
        }

        const result = await agent.launchPumpFunToken(
          name,
          symbol,
          description,
          image,
          {
            initialLiquiditySOL: initalBuySOL,
            website,
            twitter,
            telegram,
          },
        );

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to launch token',
        };
      }
    },
  },
};
