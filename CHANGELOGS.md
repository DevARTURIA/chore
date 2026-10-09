# Changelogs

## v0.4.0

- Chat agent for Solana: read a wallet, swap with Jupiter, send tokens, launch a token on Pump.fun, look up collections on Magic Eden, market data, Telegram alerts and scheduled automations
- Interface: one dark theme, the green tile and its eye, which shows what the agent is doing
- Free to use: no payment, subscription or token needed to chat; scheduled automations run for every user
- Server guard on every move of funds (swap, send, token launch, limit order, exit order, DCA): a confirm of the exact move, or auto-approve limits per move and per 24 h, both 0 by default
- Review sheet built by code from the Jupiter quote, the balance and the receiver; stale quotes refresh; a move whose result never came back is never retried on its own
- Token check before buying, transaction explainer, price alerts, daily wallet digest
- Limit orders, DCA, take-profit and stop-loss, trailing stops (Jupiter Trigger API)
- Rug watch on held tokens, share cards with a public proof page
- Security: wallet keys and the agent are never reachable as server actions, the confirm button only sends an answer, conversations are checked against their owner, the portfolio route answers signed-in users only
- Tool code runs on the server only; the browser loads only how each result is shown
- CI: typecheck, lint, format, dependency audit and secret scan
