import { PublicKey } from '@solana/web3.js';
import 'server-only';
import { z } from 'zod';

import { SolanaUtils } from '@/lib/solana';
import {
  getHoldersClassification,
  searchWalletAssets,
} from '@/lib/solana/helius';
import { retrieveAgentKit } from '@/server/actions/ai';
import { transformToPortfolio } from '@/types/helius/portfolio';
import { SOL_MINT } from '@/types/helius/portfolio';
import { publicKeySchema } from '@/types/util';

import type { SwapResult, TokenHoldersResult } from './solana.view';

// Constants
const DEFAULT_OPTIONS = {
  SLIPPAGE_BPS: 300, // 3% default slippage
} as const;

// Types
interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  inputSymbol?: string;
  outputSymbol?: string;
}

interface TokenParams {
  mint: string;
}

const domainSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9-]+\.sol$/,
    'Invalid Solana domain format. Must be a valid Solana domain name.',
  )
  .describe(
    'A Solana domain name. (e.g. toly.sol). Needed for resolving a domain to an address.  ',
  );

const wallet = {
  resolveWalletAddressFromDomain: {
    description:
      'Resolve a Solana domain name to an address. Useful for getting the address of a wallet from a domain name.',
    parameters: z.object({ domain: domainSchema }),
    execute: async ({ domain }: { domain: string }) => {
      return await SolanaUtils.resolveDomainToAddress(domain);
    },
  },
  getWalletPortfolio: {
    description:
      'Get the portfolio of a Solana wallet, including detailed token information & total value, SOL value etc.',
    parameters: z.object({ walletAddress: publicKeySchema }),
    execute: async ({ walletAddress }: { walletAddress: string }) => {
      try {
        const { fungibleTokens } = await searchWalletAssets(walletAddress);
        const portfolio = transformToPortfolio(
          walletAddress,
          fungibleTokens,
          [],
        );

        // First, separate SOL from other tokens
        const solToken = portfolio.tokens.find(
          (token) => token.symbol === 'SOL',
        );
        const otherTokens = portfolio.tokens
          .filter((token) => token.symbol !== 'SOL')
          .filter((token) => token.balance * token.pricePerToken > 0.01)
          .sort(
            (a, b) => b.balance * b.pricePerToken - a.balance * a.pricePerToken,
          )
          .slice(0, 9); // Take 9 instead of 10 to leave room for SOL

        // Combine SOL with other tokens, ensuring SOL is first
        portfolio.tokens = solToken ? [solToken, ...otherTokens] : otherTokens;

        return {
          suppressFollowUp: true,
          data: portfolio,
        };
      } catch (error) {
        throw new Error(
          `Failed to get wallet portfolio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  },
  sendTokens: {
    agentKit: null,
    description:
      'Send or transfer tokens to another Solana wallet. A transfer cannot be undone. (requires confirmation)',
    parameters: z.object({
      requiresConfirmation: z.boolean().optional().default(true),
      receiverAddress: publicKeySchema,
      tokenAddress: publicKeySchema,
      amount: z.number().min(0.000000001),
      tokenSymbol: z.string().describe('Symbol of the token to send'),
    }),
    execute: async function ({
      receiverAddress,
      tokenAddress,
      amount,
      tokenSymbol,
    }: {
      receiverAddress: string;
      tokenAddress: string;
      amount: number;
      tokenSymbol?: string;
    }) {
      try {
        const agent =
          this.agentKit ||
          (await retrieveAgentKit(undefined))?.data?.data?.agent;

        if (!agent) {
          throw new Error('Failed to retrieve agent');
        }

        const signature = await agent.transfer(
          new PublicKey(receiverAddress),
          amount,
          tokenAddress !== SOL_MINT ? new PublicKey(tokenAddress) : undefined,
        );

        return {
          success: true,
          data: {
            signature,
            receiverAddress,
            tokenAddress,
            amount,
            tokenSymbol,
          },
        };
      } catch (error) {
        throw new Error(
          `Failed to transfer tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  },
};

const swap = {
  swapTokens: {
    agentKit: null,
    description:
      'Swap tokens using Jupiter Exchange with the embedded wallet. (requires confirmation)',
    parameters: z.object({
      requiresConfirmation: z.boolean().optional().default(true),
      inputMint: publicKeySchema.describe('Source token mint address'),
      outputMint: publicKeySchema.describe('Target token mint address'),
      amount: z.number().positive().describe('Amount to swap'),
      slippageBps: z
        .number()
        .min(0)
        .max(10000)
        .optional()
        .describe('Slippage tolerance in basis points (0-10000)'),
      inputSymbol: z.string().describe('Source token symbol').default(''),
      outputSymbol: z.string().describe('Target token symbol').default(''),
    }),
    execute: async function ({
      inputMint,
      outputMint,
      amount,
      slippageBps = DEFAULT_OPTIONS.SLIPPAGE_BPS,
      inputSymbol,
      outputSymbol,
    }: SwapParams): Promise<SwapResult> {
      try {
        const agent =
          this.agentKit ||
          (await retrieveAgentKit(undefined))?.data?.data?.agent;

        if (!agent) {
          throw new Error('Failed to retrieve agent');
        }

        console.log('[swapTokens] inputMint', inputMint);
        console.log('[swapTokens] outputMint', outputMint);
        console.log('[swapTokens] amount', amount);
        console.log('[swapTokens] slippageBps', slippageBps);

        const signature = await agent.trade(
          new PublicKey(outputMint),
          amount,
          new PublicKey(inputMint),
          slippageBps,
        );

        return {
          success: true,
          data: {
            signature,
            inputMint,
            outputMint,
            amount,
            slippageBps,
            inputSymbol,
            outputSymbol,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to execute swap',
        };
      }
    },
  },
};

const token = {
  holders: {
    description: 'Get the token holder stats for a Solana token',
    parameters: z.object({
      mint: publicKeySchema.describe('Token mint address'),
    }),
    execute: async ({ mint }: TokenParams): Promise<TokenHoldersResult> => {
      try {
        const tokenHolderStats = await getHoldersClassification(mint);
        console.log('[token.holders] tokenHolderStats', tokenHolderStats);
        return {
          success: true,
          data: {
            totalHolders: tokenHolderStats.totalHolders,
            topHolders: tokenHolderStats.topHolders,
            totalSupply: tokenHolderStats.totalSupply,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to execute swap',
        };
      }
    },
  },
};

export const solanaTools = {
  ...wallet,
  ...swap,
  ...token,
};
