# Security

**chore** moves real funds on Solana. If you find a way around that, we want to hear it before anyone else does.

## Report a vulnerability

Use **Report a vulnerability** in this repository's Security tab (GitHub private vulnerability reporting). Please do not open a public issue for it.

Tell us what you found, how to reproduce it, and what an attacker could do with it. A proof of concept against your own deployment is welcome; never test against wallets that are not yours.

We aim to answer within three days. We fix in a private branch, publish the fix, then credit you in the release notes if you want to be named.

## What matters most

- Any way to move funds without the owner's confirmation or outside their auto-approve limits (the server guard in `src/server/garde.ts`).
- Any way to read or decrypt a wallet's private key (`src/lib/solana/wallet-generator.ts`, `WALLET_ENCRYPTION_KEY`).
- Reading or writing another user's conversations, actions, wallets or settings.
- A server action or API route that works without a signed-in user when it should not.
- Prompt injection through a web page, a token name or any text the agent reads, if it leads to one of the above.

## Out of scope

- Losses from a move the user confirmed, or from a token's price.
- Rate limits and costs on third-party APIs, unless they expose a secret.
- Findings that need a stolen device or a compromised deployment.

## Supported versions

Only the latest release on `main` gets security fixes.

## If you run your own deployment

- Generate `WALLET_ENCRYPTION_KEY` with `openssl rand -base64 32`, keep it out of git and back it up: without it the server wallets cannot be opened.
- Set a long random `CRON_SECRET`.
- Keep `.env` out of logs, screenshots and support messages.
