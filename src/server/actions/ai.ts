'use server';

import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { ActionEmptyResponse, actionClient } from '@/lib/safe-action';
import { getAgentKit } from '@/server/agent-kit';
import { SOL_MINT } from '@/types/helius/portfolio';
import { publicKeySchema } from '@/types/util';

import { verifyUser } from './user';

const renameSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(100),
});

export const renameConversation = actionClient
  .schema(renameSchema)
  .action(
    async ({ parsedInput: { id, title } }): Promise<ActionEmptyResponse> => {
      try {
        const authResult = await verifyUser();
        const userId = authResult?.data?.data?.id;
        if (!userId) return { success: false, error: 'UNAUTHORIZED' };
        // Only the owner renames a conversation.
        const { count } = await prisma.conversation.updateMany({
          where: { id, userId },
          data: { title },
        });
        if (count === 0) return { success: false, error: 'NOT_FOUND' };
        return { success: true };
      } catch (error) {
        return { success: false, error: 'UNEXPECTED_ERROR' };
      }
    },
  );

export const retrieveAgentKit = actionClient
  .schema(
    z
      .object({
        walletId: z.string(),
      })
      .optional(),
  )
  .action(async ({ parsedInput }) => {
    const authResult = await verifyUser();

    const userId = authResult?.data?.data?.id;

    if (!userId) {
      return { success: false, error: 'UNAUTHORIZED', data: null };
    }

    const result = await getAgentKit({
      userId,
      walletId: parsedInput?.walletId,
    });

    return result;
  });

export const transferToken = actionClient
  .schema(
    z.object({
      walletId: z.string(),
      receiverAddress: publicKeySchema,
      tokenAddress: publicKeySchema,
      amount: z.number(),
      tokenSymbol: z.string().describe('Symbol of the token to send'),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { walletId, receiverAddress, tokenAddress, amount, tokenSymbol } =
      parsedInput;

    const agentResponse = await retrieveAgentKit({ walletId });

    if (!agentResponse?.data?.success || !agentResponse?.data?.data) {
      return { success: false, error: 'AGENT_NOT_FOUND' };
    }

    const agent = agentResponse.data.data.agent;

    const signature = await agent.transfer(
      new PublicKey(receiverAddress),
      amount,
      tokenAddress !== SOL_MINT ? new PublicKey(tokenAddress) : undefined,
    );

    return { success: true, data: { signature } };
  });
