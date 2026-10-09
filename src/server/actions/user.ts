'use server';

import { revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';

import { WalletWithMetadata } from '@privy-io/server-auth';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';

import prisma from '@/lib/prisma';
import { ActionResponse, actionClient } from '@/lib/safe-action';
import { generateEncryptedKeyPair } from '@/lib/solana/wallet-generator';
import { PRIVY_SERVER_CLIENT } from '@/server/privy';
import { EmbeddedWallet, PrismaUser } from '@/types/db';

const getOrCreateUser = actionClient
  .schema(z.object({ userId: z.string() }))
  .action<ActionResponse<PrismaUser>>(async ({ parsedInput: { userId } }) => {
    const generateReferralCode = async (): Promise<string> => {
      const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890', 8); // 8-character alphanumeric

      const MAX_ATTEMPTS = 10; // Limit to prevent infinite loops
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS) {
        const referralCode = nanoid();
        const existingCode = await prisma.user.findUnique({
          where: { referralCode },
        });

        if (!existingCode) {
          return referralCode; // Return the unique code
        }

        attempts++;
      }

      // Failsafe: throw an error if a unique code couldn't be generated
      throw new Error(
        'Unable to generate a unique referral code after 10 attempts',
      );
    };

    const existingUser = await prisma.user.findUnique({
      where: { privyId: userId },
      include: {
        wallets: {
          select: {
            id: true,
            ownerId: true,
            name: true,
            publicKey: true,
            walletSource: true,
            delegated: true,
            active: true,
            chain: true,
          },
          where: {
            active: true,
          },
        },
        subscription: {
          include: {
            payments: true,
          },
        },
      },
    });

    if (existingUser) {
      // If the user exists but doesn't have a referralCode, generate one
      if (!existingUser.referralCode) {
        const referralCode = await generateReferralCode();
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { referralCode },
        });
        existingUser.referralCode = referralCode;
      }
      return { success: true, data: existingUser };
    }

    // Look up referralCode from cookie
    const cookieReferralCode = (await cookies()).get('referralCode')?.value;
    let referringUserId: string | null = null;

    if (cookieReferralCode) {
      const referringUser = await prisma.user.findUnique({
        where: { referralCode: cookieReferralCode },
        select: { id: true },
      });

      if (referringUser) {
        referringUserId = referringUser.id;
      }
    }

    // Create a new user if none exists
    const referralCode = await generateReferralCode();
    const createdUser = await prisma.user.create({
      data: {
        privyId: userId,
        referralCode,
        referringUserId,
      },
    });

    const { publicKey, encryptedPrivateKey } = await generateEncryptedKeyPair();
    const initialWallet = await prisma.wallet.create({
      data: {
        ownerId: createdUser.id,
        name: 'Default',
        publicKey,
        encryptedPrivateKey,
      },
    });

    return {
      success: true,
      data: {
        ...createdUser,
        wallets: [
          {
            id: initialWallet.id,
            ownerId: initialWallet.ownerId,
            name: initialWallet.name,
            publicKey: initialWallet.publicKey,
            walletSource: initialWallet.walletSource,
            delegated: initialWallet.delegated,
            active: initialWallet.active,
            chain: initialWallet.chain,
          },
        ],
        subscription: null,
      },
    };
  });

export const verifyUser = actionClient.action<
  ActionResponse<{
    id: string;
    autoApproveTxUsd: number;
    autoApproveDayUsd: number;
    publicKey?: string;
    privyId: string;
  }>
>(async () => {
  const token = (await cookies()).get('privy-token')?.value;
  if (!token) {
    return {
      success: false,
      error: 'No privy token found',
    };
  }

  try {
    const claims = await PRIVY_SERVER_CLIENT.verifyAuthToken(token);
    const user = await prisma.user.findUnique({
      where: { privyId: claims.userId },
      select: {
        id: true,
        autoApproveTxUsd: true,
        autoApproveDayUsd: true,
        privyId: true,
        wallets: {
          select: {
            publicKey: true,
          },
          where: {
            active: true,
          },
        },
      },
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    return {
      success: true,
      data: {
        id: user.id,
        privyId: user.privyId,
        publicKey: user.wallets[0]?.publicKey,
        autoApproveTxUsd: user.autoApproveTxUsd,
        autoApproveDayUsd: user.autoApproveDayUsd,
      },
    };
  } catch {
    return { success: false, error: 'Authentication failed' };
  }
});

export const getUserData = actionClient.action<ActionResponse<PrismaUser>>(
  async () => {
    const token = (await cookies()).get('privy-token')?.value;
    if (!token) {
      return {
        success: false,
        error: 'No privy token found',
      };
    }

    try {
      const claims = await PRIVY_SERVER_CLIENT.verifyAuthToken(token);

      const response = await getOrCreateUser({ userId: claims.userId });
      if (!response?.data?.success) {
        return { success: false, error: response?.data?.error };
      }

      const user = response.data?.data;
      if (!user) {
        return { success: false, error: 'Could not create or retrieve user' };
      }

      return { success: true, data: user };
    } catch {
      return { success: false, error: 'Authentication failed' };
    }
  },
);

export const syncEmbeddedWallets = actionClient.action<
  ActionResponse<{ wallets: EmbeddedWallet[] }>
>(async () => {
  const response = await getUserData();
  if (!response?.data?.success || !response.data?.data) {
    return { success: false, error: 'Local user not found in DB' };
  }

  const userData = response.data.data;

  const privyUser = await PRIVY_SERVER_CLIENT.getUser(userData.privyId);

  const embeddedWallets = privyUser.linkedAccounts.filter(
    (acct): acct is WalletWithMetadata =>
      acct.type === 'wallet' && acct.walletClientType === 'privy',
  );

  try {
    for (const w of embeddedWallets) {
      const pubkey = w.address;
      if (!pubkey) continue;

      await prisma.wallet.upsert({
        where: {
          ownerId_publicKey: {
            ownerId: userData.id,
            publicKey: pubkey,
          },
        },
        update: {
          name: 'Privy Embedded',
          walletSource: 'PRIVY',
          delegated: w.delegated ?? false,
          publicKey: pubkey,
          encryptedPrivateKey: undefined, // This will handle a case where a user imports a wallet to privy
        },
        create: {
          ownerId: userData.id,
          name: 'Privy Embedded',
          publicKey: pubkey,
          walletSource: 'PRIVY',
          chain: 'SOLANA',
          delegated: w.delegated ?? false,
          active: false,
          encryptedPrivateKey: undefined,
        },
      });
    }
  } catch (error) {
    return { success: false, error: 'Error retrieving updated user' };
  }

  const userWallets = await prisma.wallet.findMany({
    where: { ownerId: userData.id },
    select: {
      id: true,
      publicKey: true,
      walletSource: true,
      delegated: true,
      name: true,
      ownerId: true,
      active: true,
      chain: true,
    },
  });

  return { success: true, data: { wallets: userWallets } };
});

export type UserUpdateData = {
  /** Auto-approve limits in USD; 0 means every move asks. */
  autoApproveTxUsd?: number;
  autoApproveDayUsd?: number;
  referralCode?: string; // Add referralCode as an optional field
};
class LimitsError extends Error {}

/** Limits as stored: finite, never negative, the daily one never below the per-move one. */
function autoApproveLimits(data: UserUpdateData) {
  const clean = (n: unknown) => {
    if (n === undefined) return undefined;
    if (typeof n !== 'number' || !Number.isFinite(n))
      throw new LimitsError('Auto-approve limits must be numbers.');
    return Math.max(0, n);
  };
  const tx = clean(data.autoApproveTxUsd);
  const day = clean(data.autoApproveDayUsd);
  if (tx === undefined && day === undefined) return {};
  if (tx === undefined || day === undefined)
    throw new LimitsError('Set both auto-approve limits together.');
  return { autoApproveTxUsd: tx, autoApproveDayUsd: Math.max(day, tx) };
}

export async function updateUser(data: UserUpdateData) {
  try {
    const authResult = await verifyUser();
    const userId = authResult?.data?.data?.id;
    const privyId = authResult?.data?.data?.privyId;

    if (!userId) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    // Extract referralCode from the input data
    const { referralCode } = data;
    const limits = autoApproveLimits(data);

    // If referralCode is provided, validate and update referringUserId
    if (referralCode) {
      const referringUser = await prisma.user.findUnique({
        where: { referralCode },
      });

      if (!referringUser) {
        return { success: false, error: 'Invalid referral code' };
      }

      if (referringUser.id === userId) {
        return {
          success: false,
          error: 'You cannot use your own referral code',
        };
      }

      // Prevent getting referred by a user who has already been referred by you
      if (referringUser.referringUserId === userId) {
        return {
          success: false,
          error: 'You cannot use a referral code from someone you referred',
        };
      }

      // Update referringUserId along with other fields
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...limits,
          referringUserId: referringUser.id,
        },
      });
    } else {
      // Update user without referral logic if no referralCode is provided
      await prisma.user.update({
        where: { id: userId },
        data: limits,
      });
    }

    // Revalidate user cache
    revalidateTag(`user-${privyId}`);
    return { success: true };
  } catch (error) {
    console.error('Error updating user:', error);
    // Our own validation messages are safe to show; anything else stays generic.
    const message =
      error instanceof LimitsError ? error.message : 'Failed to update user';
    return { success: false, error: message };
  }
}
