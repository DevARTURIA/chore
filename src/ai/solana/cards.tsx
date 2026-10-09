import 'server-only';
import { z } from 'zod';

import { retrieveAgentKit } from '@/server/actions/ai';
import { verifyUser } from '@/server/actions/user';
import { makeCard } from '@/server/cards';
import { publicKeySchema } from '@/types/util';

import type { CardResult } from './cards.view';

/** The wallet the agent acts for, and the signed-in user (scheduled runs pass them in). */
export async function whoIs(self: { agentKit?: unknown; userId?: unknown }) {
  const agent: any =
    self.agentKit || (await retrieveAgentKit(undefined))?.data?.data?.agent;
  const wallet: string | undefined = (
    agent?.wallet?.publicKey ?? agent?.wallet_address
  )?.toBase58?.();
  const userId =
    (typeof self.userId === 'string' && self.userId) ||
    (await verifyUser())?.data?.data?.id;
  if (!wallet || !userId) throw new Error('No wallet found for this account.');
  return { wallet, userId };
}

export const cardTools = {
  shareCard: {
    agentKit: null,
    description:
      "Make a share card (an image for X or Telegram) of the user's own wallet, computed by the server from the chain: kind 'wallet' (PnL over a period), 'token' (PnL on one token, give its mint), 'holdings' (what the wallet holds now) or 'rugcheck' (signals on every token held). Style 'plage' (beach) or 'nuit' (night); sky 'stats' or 'tokens' (top movers, wallet PnL on the beach style only); format 'wide' (X) or 'square' (Telegram). Returns a public proof page that lists the transactions behind the numbers. Never type numbers into a card: only the server computes them.",
    parameters: z.object({
      kind: z.enum(['wallet', 'token', 'holdings', 'rugcheck']),
      period: z
        .enum(['24h', '7d', '30d', 'all'])
        .optional()
        .describe("For kind 'wallet'; default 7d"),
      mint: publicKeySchema.optional().describe("For kind 'token'"),
      style: z.enum(['plage', 'nuit']).optional(),
      sky: z.enum(['stats', 'tokens']).optional(),
      format: z.enum(['wide', 'square']).optional(),
    }),
    execute: async function (
      this: { agentKit?: unknown; userId?: unknown },
      p: {
        kind: 'wallet' | 'token' | 'holdings' | 'rugcheck';
        period?: '24h' | '7d' | '30d' | 'all';
        mint?: string;
        style?: 'plage' | 'nuit';
        sky?: 'stats' | 'tokens';
        format?: 'wide' | 'square';
      },
    ): Promise<CardResult> {
      try {
        const { wallet, userId } = await whoIs(this);
        const look = Object.fromEntries(
          Object.entries({
            style: p.style,
            sky: p.sky,
            format: p.format,
          }).filter(([, v]) => v),
        );
        const {
          code,
          model,
          look: l,
        } = await makeCard(userId, wallet, {
          kind: p.kind,
          period: p.period,
          mint: p.mint,
          look,
        });
        const q = new URLSearchParams(
          l as unknown as Record<string, string>,
        ).toString();
        return {
          success: true,
          data: {
            code,
            page: `/p/${code}`,
            image: `/api/card/${code}?${q}`,
            title: model.title,
            big: model.big,
            line: model.line,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to make the card',
        };
      }
    },
  },
};
