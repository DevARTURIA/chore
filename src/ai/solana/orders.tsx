import 'server-only';
import { z } from 'zod';

import { RPC_URL } from '@/lib/constants';
import {
  DEFAULT_EXPIRY_DAYS,
  TriggerClient,
  expiryFrom,
  planExit,
} from '@/lib/fonctions/jupiter-orders';
import { MINTS, amount, prices, tokenInfo, usd } from '@/lib/fonctions/lib';
import { signerFromAgent } from '@/lib/fonctions/signer';
import { retrieveAgentKit } from '@/server/actions/ai';
import { publicKeySchema } from '@/types/util';

import type { OrderResult } from './orders.view';

/** "every 15 min", "every 1 h 30 min", "every 2 days": exact, never rounded to zero. */
function every(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.round((seconds % 3600) / 60);
  const parts = [
    d ? `${d} ${d === 1 ? 'day' : 'days'}` : '',
    h ? `${h} h` : '',
    m ? `${m} min` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : `${seconds} s`;
}

const env = () => ({
  rpcUrl: RPC_URL,
  jupiterApiKey: process.env.JUPITER_API_KEY || undefined,
});

/** Whole tokens to the smallest unit, as the Trigger API wants it. */
const toRaw = (n: number, decimals: number) =>
  BigInt(Math.round(n * 10 ** Math.min(decimals, 9))) *
  BigInt(10) ** BigInt(Math.max(decimals - 9, 0));

async function agentOf(self: { agentKit: unknown }) {
  const agent =
    self.agentKit || (await retrieveAgentKit(undefined))?.data?.data?.agent;
  if (!agent) throw new Error('Failed to retrieve agent');
  return agent;
}

export const orderTools = {
  createLimitOrder: {
    agentKit: null,
    description:
      "Create a limit order with Jupiter: sell an amount of one token for another when a token price goes above or below a USD target. Funds move into the user's Jupiter vault until it fills or is cancelled. (requires confirmation)",
    parameters: z.object({
      requiresConfirmation: z.boolean().optional().default(true),
      inputMint: publicKeySchema.describe('Token to sell'),
      outputMint: publicKeySchema.describe('Token to buy'),
      amount: z
        .number()
        .positive()
        .describe('Amount of the input token, in whole tokens'),
      triggerMint: publicKeySchema.describe(
        'Token whose USD price triggers the order: the input or the output token, not a stablecoin',
      ),
      condition: z.enum(['above', 'below']),
      priceUsd: z.number().positive(),
      expiresInDays: z.number().int().min(1).max(365).optional(),
    }),
    requiredEnvVars: ['JUPITER_API_KEY'],
    execute: async function (
      this: { agentKit: unknown },
      p: {
        inputMint: string;
        outputMint: string;
        amount: number;
        triggerMint: string;
        condition: 'above' | 'below';
        priceUsd: number;
        expiresInDays?: number;
      },
    ): Promise<OrderResult> {
      try {
        const e = env();
        const [meta, agent] = await Promise.all([
          tokenInfo(e, [p.inputMint, p.outputMint]),
          agentOf(this),
        ]);
        const input = meta[p.inputMint];
        if (!input) throw new Error('Unknown input token.');
        const client = new TriggerClient(e, signerFromAgent(agent));
        const order = await client.createLimit({
          inputMint: p.inputMint,
          outputMint: p.outputMint,
          inputAmount: toRaw(p.amount, input.decimals).toString(),
          triggerMint: p.triggerMint,
          triggerCondition: p.condition,
          triggerPriceUsd: p.priceUsd,
          expiresAt: expiryFrom(p.expiresInDays),
        });
        const sym = (m: string) => meta[m]?.symbol ?? m.slice(0, 4);
        return {
          success: true,
          data: {
            ...order,
            lines: [
              ['You sell', `${amount(p.amount)} ${input.symbol}`],
              ['For', sym(p.outputMint)],
              [
                'When',
                `${sym(p.triggerMint)} goes ${p.condition} ${usd(p.priceUsd)}`,
              ],
              ['Expires', `in ${p.expiresInDays ?? DEFAULT_EXPIRY_DAYS} days`],
            ],
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to create the order',
        };
      }
    },
  },

  createExitOrder: {
    agentKit: null,
    description:
      "Take-profit, stop-loss or both (one cancels the other), or a trailing stop, on a token the user holds, with Jupiter. Prices in dollars or in percent from the price now (takeProfitPct: 50 means +50%; stopLossPct: 30 means -30%); trailingPct goes alone. Tokens wait in the user's Jupiter vault until it fills, expires or is cancelled; orders under $10 are refused. (requires confirmation)",
    parameters: z.object({
      requiresConfirmation: z.boolean().optional().default(true),
      mint: publicKeySchema.describe('Token to sell'),
      amount: z.number().positive().describe('Amount to sell, in whole tokens'),
      receiveMint: publicKeySchema
        .optional()
        .describe('Token received; default USDC'),
      takeProfitUsd: z.number().positive().optional(),
      takeProfitPct: z.number().positive().optional(),
      stopLossUsd: z.number().positive().optional(),
      stopLossPct: z.number().positive().max(99).optional(),
      trailingPct: z.number().min(0.5).max(90).optional(),
      expiresInDays: z.number().int().min(1).max(365).optional(),
    }),
    requiredEnvVars: ['JUPITER_API_KEY'],
    execute: async function (
      this: { agentKit: unknown },
      p: {
        mint: string;
        amount: number;
        receiveMint?: string;
        takeProfitUsd?: number;
        takeProfitPct?: number;
        stopLossUsd?: number;
        stopLossPct?: number;
        trailingPct?: number;
        expiresInDays?: number;
      },
    ): Promise<OrderResult> {
      try {
        const e = env();
        const out = p.receiveMint ?? MINTS.USDC;
        const [meta, px, agent] = await Promise.all([
          tokenInfo(e, [p.mint, out]),
          prices(e, [p.mint]),
          agentOf(this),
        ]);
        const input = meta[p.mint];
        if (!input) throw new Error('Unknown token.');
        const now = px[p.mint];
        const plan = planExit(p, now);
        const client = new TriggerClient(e, signerFromAgent(agent));
        const order = await client.createExit(
          {
            inputMint: p.mint,
            outputMint: out,
            inputAmount: toRaw(p.amount, input.decimals).toString(),
            ...plan,
            expiresAt: expiryFrom(p.expiresInDays),
          },
          now,
          now !== undefined ? now * p.amount : undefined,
        );
        const lines: [string, string][] = [
          ['You sell', `${amount(p.amount)} ${input.symbol}`],
          ['For', meta[out]?.symbol ?? out.slice(0, 4)],
        ];
        if (plan.takeProfitUsd !== undefined)
          lines.push(['Take-profit', `at ${usd(plan.takeProfitUsd)}`]);
        if (plan.stopLossUsd !== undefined)
          lines.push(['Stop-loss', `at ${usd(plan.stopLossUsd)}`]);
        if (plan.trailingBps !== undefined)
          lines.push([
            'Trailing stop',
            `${(plan.trailingBps / 100).toFixed(1)}% under its best price`,
          ]);
        lines.push([
          'Expires',
          `in ${p.expiresInDays ?? DEFAULT_EXPIRY_DAYS} days`,
        ]);
        return { success: true, data: { ...order, lines } };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to create the order',
        };
      }
    },
  },

  createDcaOrder: {
    agentKit: null,
    description:
      "Create a DCA with Jupiter: split a budget into equal buys on a schedule (at least 2 rounds, each worth at least $10). The budget moves into the user's Jupiter vault; unspent funds come back on cancel. (requires confirmation)",
    parameters: z.object({
      requiresConfirmation: z.boolean().optional().default(true),
      inputMint: publicKeySchema.describe('Token to spend'),
      outputMint: publicKeySchema.describe('Token to buy'),
      amount: z
        .number()
        .positive()
        .describe('Total budget, in whole input tokens'),
      rounds: z.number().int().min(2),
      intervalSeconds: z
        .number()
        .int()
        .min(60)
        .max(31_536_000)
        .describe('Time between rounds, e.g. 86400 for daily'),
    }),
    requiredEnvVars: ['JUPITER_API_KEY'],
    execute: async function (
      this: { agentKit: unknown },
      p: {
        inputMint: string;
        outputMint: string;
        amount: number;
        rounds: number;
        intervalSeconds: number;
      },
    ): Promise<OrderResult> {
      try {
        const e = env();
        const [meta, px, agent] = await Promise.all([
          tokenInfo(e, [p.inputMint, p.outputMint]),
          prices(e, [p.inputMint]),
          agentOf(this),
        ]);
        const input = meta[p.inputMint];
        if (!input) throw new Error('Unknown input token.');
        const budgetUsd =
          px[p.inputMint] !== undefined
            ? px[p.inputMint] * p.amount
            : undefined;
        const client = new TriggerClient(e, signerFromAgent(agent));
        const order = await client.createDca(
          {
            inputMint: p.inputMint,
            outputMint: p.outputMint,
            inputAmount: toRaw(p.amount, input.decimals).toString(),
            orderCount: p.rounds,
            intervalSeconds: p.intervalSeconds,
          },
          budgetUsd,
        );
        return {
          success: true,
          data: {
            ...order,
            lines: [
              ['Budget', `${amount(p.amount)} ${input.symbol}`],
              ['Buys', meta[p.outputMint]?.symbol ?? p.outputMint.slice(0, 4)],
              ['Rounds', `${p.rounds}, every ${every(p.intervalSeconds)}`],
              ['Per round', `${amount(p.amount / p.rounds)} ${input.symbol}`],
            ],
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to create the DCA',
        };
      }
    },
  },
};
