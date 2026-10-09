import 'server-only';
import { z } from 'zod';

import { RPC_URL } from '@/lib/constants';
import { checkToken } from '@/lib/fonctions/check-token';
import { explainTx } from '@/lib/fonctions/explain-tx';
import { publicKeySchema } from '@/types/util';

const env = () => ({
  rpcUrl: RPC_URL,
  jupiterApiKey: process.env.JUPITER_API_KEY || undefined,
});

const fail = (error: unknown, fallback: string) => ({
  success: false,
  error: error instanceof Error ? error.message : fallback,
});

export const safetyTools = {
  checkTokenSafety: {
    description:
      'Check a Solana token before buying it: mint and freeze authority, holder concentration, creator share, liquidity, age, organic activity. Returns signals, never a guarantee. Call it before any swap into a token that is not SOL, USDC or USDT, and show it to the user.',
    parameters: z.object({
      mint: publicKeySchema.describe('The token mint address'),
    }),
    execute: async ({ mint }: { mint: string }) => {
      try {
        return { success: true, data: await checkToken(env(), mint) };
      } catch (error) {
        return fail(error, 'Failed to check the token');
      }
    },
  },

  explainTransaction: {
    description:
      'Explain a Solana transaction in plain words from its signature: what left and entered the signer wallet, the fee, the programs used.',
    parameters: z.object({
      signature: z.string().describe('The transaction signature'),
    }),
    execute: async ({ signature }: { signature: string }) => {
      try {
        return {
          success: true,
          suppressFollowUp: true,
          data: await explainTx(env(), signature.trim()),
        };
      } catch (error) {
        return fail(error, 'Failed to read the transaction');
      }
    },
  },
};
