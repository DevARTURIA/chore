// Server only: never import this from a 'use server' file's exports or from a client component.
// It used to be returned by a server action (getPrivyClient), which made it callable from outside.
import { PrivyClient } from '@privy-io/server-auth';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PRIVY_SIGNING_KEY = process.env.PRIVY_SIGNING_KEY;

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  throw new Error('Missing required Privy environment variables');
}

export const PRIVY_SERVER_CLIENT = new PrivyClient(
  PRIVY_APP_ID,
  PRIVY_APP_SECRET,
  {
    ...(!!PRIVY_SIGNING_KEY && {
      walletApi: {
        authorizationPrivateKey: PRIVY_SIGNING_KEY,
      },
    }),
  },
);
