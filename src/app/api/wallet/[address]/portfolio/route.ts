import { NextRequest } from 'next/server';

import { searchWalletAssets } from '@/lib/solana/helius';
import { verifyUser } from '@/server/actions/user';
import { transformToPortfolio } from '@/types/helius/portfolio';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  // Signed-in users only: each call spends the deployment's Helius key
  const session = await verifyUser();
  if (!session?.data?.data?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { address } = await params;
    const { fungibleTokens, nonFungibleTokens } =
      await searchWalletAssets(address);
    const portfolio = transformToPortfolio(
      address,
      fungibleTokens,
      nonFungibleTokens,
    );

    return Response.json(portfolio);
  } catch (error) {
    console.error('Error fetching wallet portfolio:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch wallet portfolio' }),
      {
        status: 500,
      },
    );
  }
}
