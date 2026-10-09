// Server only. The agent holds the wallet's signer: it is built here, for a user id the caller
// has already checked (retrieveAgentKit after verifyUser, or a cron job with CRON_SECRET).
// Not a 'use server' file on purpose: every export of one is a server action anyone can call.
import { PublicKey } from '@solana/web3.js';
import { BaseWallet, SolanaAgentKit, WalletAdapter } from 'solana-agent-kit';

import { RPC_URL } from '@/lib/constants';
import prisma from '@/lib/prisma';
import { PrivyEmbeddedWallet } from '@/lib/solana/PrivyEmbeddedWallet';
import { decryptPrivateKey } from '@/lib/solana/wallet-generator';
import { PRIVY_SERVER_CLIENT } from '@/server/privy';

export const getAgentKit = async ({
  userId,
  walletId,
}: {
  userId: string;
  walletId?: string;
}) => {
  const whereClause = walletId
    ? { ownerId: userId, id: walletId }
    : { ownerId: userId, active: true };

  const wallet = await prisma.wallet.findFirst({
    where: whereClause,
  });

  if (!wallet) {
    return { success: false, error: 'WALLET_NOT_FOUND' };
  }

  let walletAdapter: WalletAdapter;
  if (wallet.encryptedPrivateKey) {
    walletAdapter = new BaseWallet(
      await decryptPrivateKey(wallet?.encryptedPrivateKey),
    );
  } else {
    walletAdapter = new PrivyEmbeddedWallet(
      PRIVY_SERVER_CLIENT,
      new PublicKey(wallet.publicKey),
    );
  }

  const openaiKey = process.env.OPENAI_API_KEY!;
  const agent = new SolanaAgentKit(walletAdapter, RPC_URL, {
    OPENAI_API_KEY: openaiKey,
    HELIUS_API_KEY: process.env.HELIUS_API_KEY!,
  });

  return { success: true, data: { agent } };
};
