import type { Message } from 'ai';

import type { ToolConfig } from '@/ai/providers';
import { RPC_URL } from '@/lib/constants';
import {
  type Ledger,
  type Move,
  guard,
  moveOf,
  movesFunds,
} from '@/lib/fonctions/garde';
import prisma from '@/lib/prisma';

/** The guard's state for one user, in the database. */
export function prismaLedger(userId: string): Ledger {
  return {
    async limits() {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { autoApproveTxUsd: true, autoApproveDayUsd: true },
      });
      return {
        perTxUsd: user?.autoApproveTxUsd ?? 0,
        perDayUsd: user?.autoApproveDayUsd ?? 0,
      };
    },
    async spentSince(since) {
      const { _sum } = await prisma.agentMove.aggregate({
        where: {
          userId,
          confirmed: false,
          createdAt: { gte: new Date(since) },
        },
        _sum: { valueUsd: true },
      });
      return _sum.valueUsd ?? 0;
    },
    async record({ move, valueUsd, confirmed }) {
      await prisma.agentMove.create({
        data: {
          userId,
          tool: move.tool,
          mint: move.mint,
          amount: move.amount,
          to: move.to,
          valueUsd: valueUsd ?? null,
          confirmed,
        },
      });
    },
  };
}

/**
 * The move the user just confirmed, read from the confirmation they answered: the tool and
 * arguments the agent put in `askForConfirmation`, which the review sheet showed.
 */
export function confirmedMoveOf(
  unconfirmed: Message | undefined,
  updates: { toolCallId: string; result: string }[],
): Move | undefined {
  const ask = unconfirmed?.toolInvocations?.find(
    (t) => t.toolName === 'askForConfirmation',
  );
  if (!ask) return undefined;
  const answer = updates.find((u) => u.toolCallId === ask.toolCallId)?.result;
  if (answer !== 'confirm') return undefined;
  const { tool, args } = (ask.args ?? {}) as { tool?: string; args?: unknown };
  return tool ? moveOf(tool, args) : undefined;
}

/**
 * Copies of the tools where every tool that moves funds goes through the guard first.
 * The shared tool objects are never mutated.
 */
export function guardTools(
  tools: Record<string, ToolConfig>,
  ctx: { userId: string; confirmed?: Move },
): Record<string, ToolConfig> {
  const shared = {
    env: {
      rpcUrl: RPC_URL,
      jupiterApiKey: process.env.JUPITER_API_KEY || undefined,
    },
    ledger: prismaLedger(ctx.userId),
    confirmed: { move: ctx.confirmed },
  };
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      if (!movesFunds(name) || !tool.execute) return [name, tool];
      const copy: ToolConfig = { ...tool };
      const run = tool.execute as (
        this: ToolConfig,
        args: unknown,
      ) => Promise<unknown>;
      const guarded = guard(
        name,
        (args: unknown) => run.call(copy, args),
        shared,
      );
      copy.execute = guarded as ToolConfig['execute'];
      return [name, copy];
    }),
  );
}
