import 'server-only';
import { z } from 'zod';

import { RPC_URL } from '@/lib/constants';
import { type WatchState, watchHoldings } from '@/lib/fonctions/holdings-watch';
import { crossedRecently } from '@/lib/fonctions/price-alert';
import { digest } from '@/lib/fonctions/wallet-digest';
import prisma from '@/lib/prisma';
import { publicKeySchema } from '@/types/util';

import { whoIs } from './cards';

const env = () => ({
  rpcUrl: RPC_URL,
  jupiterApiKey: process.env.JUPITER_API_KEY || undefined,
});

// Both tools are meant for scheduled actions: the action's description tells the agent to call
// them, then to send the message on Telegram only when there is something to say.
export const watchTools = {
  watchHoldings: {
    agentKit: null,
    description:
      "Rug watch on every token a wallet holds (the user's own by default): the first run reports red flags, later runs report only what changed since the last one (the creator sold, liquidity left, holders concentrated, price fell 50%+, a new token arrived). Made for a scheduled action that sends the message on Telegram only when alert is true; also fine in chat. Signals, never a guarantee.",
    parameters: z.object({
      walletAddress: publicKeySchema
        .optional()
        .describe("Defaults to the user's own wallet"),
    }),
    execute: async function (
      this: { agentKit?: unknown; userId?: unknown },
      { walletAddress }: { walletAddress?: string },
    ) {
      try {
        const me = await whoIs(this);
        const wallet = walletAddress ?? me.wallet;
        const key = { userId_wallet: { userId: me.userId, wallet } };
        const row = await prisma.holdingWatch.findUnique({ where: key });
        const r = await watchHoldings(
          env(),
          wallet,
          (row?.state as unknown as WatchState) ?? undefined,
        );
        const state = r.state as unknown as object;
        await prisma.holdingWatch.upsert({
          where: key,
          create: { userId: me.userId, wallet, state },
          update: { state },
        });
        return {
          success: true,
          data: { alert: r.alert, message: r.message, checked: r.checked },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to watch the wallet',
        };
      }
    },
  },

  checkPriceAlert: {
    description:
      'For price alerts in scheduled actions. Tells whether a token crossed a USD price within the last run interval. Set windowSeconds to the action frequency. Send the returned message (for example on Telegram) only when triggered is true; otherwise say nothing.',
    parameters: z.object({
      mint: publicKeySchema.describe('The token mint address'),
      symbol: z.string().optional().describe('Token symbol, for the message'),
      direction: z.enum(['above', 'below']),
      priceUsd: z.number().positive(),
      windowSeconds: z
        .number()
        .int()
        .min(60)
        .describe('The scheduled action frequency in seconds'),
    }),
    execute: async (args: {
      mint: string;
      symbol?: string;
      direction: 'above' | 'below';
      priceUsd: number;
      windowSeconds: number;
    }) => {
      try {
        return {
          success: true,
          data: await crossedRecently({ rpcUrl: RPC_URL }, args),
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to check the price',
        };
      }
    },
  },

  getWalletDigest: {
    description:
      'A short digest of a wallet: total value, 24 h price moves on what it holds, top holdings. Made for a daily scheduled action that sends it on Telegram.',
    parameters: z.object({ walletAddress: publicKeySchema }),
    execute: async ({ walletAddress }: { walletAddress: string }) => {
      try {
        const d = await digest(env(), walletAddress);
        return {
          success: true,
          data: { message: d.message, totalUsd: d.snapshot.totalUsd },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to read the wallet',
        };
      }
    },
  },
};
