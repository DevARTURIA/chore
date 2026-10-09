'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

import { RPC_URL } from '@/lib/constants';

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: false,
});

export default function AuthProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#A6F05A',
          logo: '/brand/logo-mot.png',
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors as any,
          },
        },
        solanaClusters: [{ name: 'mainnet-beta', rpcUrl: RPC_URL }],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
