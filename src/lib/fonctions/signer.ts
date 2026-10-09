import { VersionedTransaction } from '@solana/web3.js';
import { createPrivateKey, sign } from 'node:crypto';
import 'server-only';

import type { Signer } from './jupiter-orders';

// PKCS#8 header for a raw 32-byte Ed25519 seed.
const ED25519_PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');

/** A Trigger API signer from the agent's wallet: the Privy embedded wallet signs through Privy,
 * a wallet with a local key signs here. The key never leaves the server. */
export function signerFromAgent(agent: any): Signer {
  const wallet = agent?.wallet;
  const publicKey: string | undefined = (
    wallet?.publicKey ?? agent?.wallet_address
  )?.toBase58?.();
  if (!wallet || !publicKey) throw new Error('No wallet to sign with.');

  return {
    publicKey,
    async signMessage(message) {
      if (typeof wallet.signMessage === 'function') {
        const out = await wallet.signMessage(message);
        return out instanceof Uint8Array
          ? out
          : new Uint8Array(out.signature ?? out);
      }
      const secret: Uint8Array | undefined =
        wallet.payer?.secretKey ?? wallet.secretKey;
      if (secret?.length === 64) {
        const key = createPrivateKey({
          key: Buffer.concat([ED25519_PKCS8, Buffer.from(secret.slice(0, 32))]),
          format: 'der',
          type: 'pkcs8',
        });
        return new Uint8Array(sign(null, Buffer.from(message), key));
      }
      throw new Error('This wallet cannot sign messages.');
    },
    async signTransaction(base64Tx) {
      const tx = VersionedTransaction.deserialize(
        Buffer.from(base64Tx, 'base64'),
      );
      const signed = await wallet.signTransaction(tx);
      return Buffer.from(signed.serialize()).toString('base64');
    },
  };
}
