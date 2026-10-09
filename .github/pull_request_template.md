## What changes

<!-- One or two sentences, in plain words. -->

## Why

<!-- The problem it solves, or the issue it closes. -->

## Funds and keys

- [ ] This change does not touch a tool that moves funds, the server guard, or wallet keys.
- [ ] If it does: the guard still refuses a move that was not confirmed and does not fit the limits, and I say how I checked.

## Checks

- [ ] `pnpm lint` and `pnpm exec tsc --noEmit` pass
- [ ] Tried in `pnpm dev`, with screenshots for UI changes
- [ ] No secret, key or `.env` content in the diff
