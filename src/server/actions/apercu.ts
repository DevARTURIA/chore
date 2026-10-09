'use server';

import { RPC_URL } from '@/lib/constants';
import { type Preview, preview } from '@/lib/fonctions/apercu';

import { verifyUser } from './user';

/** The review sheet of a move, computed here from the exact tool and arguments. */
export async function previewMove(
  tool: string,
  args: unknown,
): Promise<{ data?: Preview; error?: string }> {
  const session = await verifyUser();
  const wallet = session?.data?.data?.publicKey;
  if (!wallet) return { error: 'Sign in to review this.' };
  try {
    const data = await preview(
      {
        rpcUrl: RPC_URL,
        jupiterApiKey: process.env.JUPITER_API_KEY || undefined,
      },
      tool,
      args,
      wallet,
    );
    return { data };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'The review could not load.',
    };
  }
}
