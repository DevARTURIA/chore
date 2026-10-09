# Local Development

How to run **chore** on your machine. The app is free: no payment, token or early access is needed to use it.

## Environment Variables

You will need to sign up for [Privy](https://www.privy.io/) and create a development app.

Choice of model provider:

- [OpenRouter](https://openrouter.ai/) API key (Accepts payments via crypto)
- [Anthropic](https://www.anthropic.com/) API key
- [OpenAI](https://platform.openai.com/) API key

You also need to have

- [ImgBB](https://api.imgbb.com/) API key for image uploads
- [Jina AI](https://jina.ai/) API key for url retrieval

Create a `.env` file:

```
# Required Model Secrets (Either OpenAI compatible or Anthropic directly)

OPENAI_API_KEY=<YOUR_OPENAI_API_KEY> # Recommended from https://openrouter.ai/
OPENAI_BASE_URL=<YOUR_OPENAI_BASE_URL> # Recommended: https://openrouter.ai/
OPENAI_MODEL_NAME=<YOUR_OPENAI_MODEL_NAME> # Recommended: anthropic/claude-3.5-sonnet
# OR
ANTHROPIC_API_KEY=<YOUR_ANTHROPIC_API_KEY>


# Required Secrets
PRIVY_APP_SECRET=<YOUR_PRIVY_APP_SECRET>
WALLET_ENCRYPTION_KEY=<YOUR_WALLET_ENCRYPTION_KEY>
HELIUS_API_KEY=<YOUR_HELIUS_API_KEY> # Helius SDK is used on the backend for smart transactions for swaps

# Optional Secrets (tools might not work)
JINA_API_KEY=<YOUR_JINA_API_KEY> # web scraping
CG_API_KEY=<YOUR_COIN_GECKO_API_KEY> # charts
CG_BASE_URL=<BASE_URL_FOR_COIN_GECKO> # there are different urls for demo vs pro
TELEGRAM_BOT_TOKEN=<YOUR_TG_BOT_TOKEN> # sending notifications through telegram
TELEGRAM_BOT_USERNAME=<YOUR_TG_BOT_USERNAME> # optional, but saves an API call


# Public
NEXT_PUBLIC_APP_NAME=chore
NEXT_PUBLIC_APP_URL=https://choresol.fun # your deployment's URL: used for metadata and referral links
NEXT_PUBLIC_DOCS_URL=<optional>
NEXT_PUBLIC_GITHUB_URL=https://github.com/DevARTURIA/chore
NEXT_PUBLIC_X_URL=https://x.com/CHOREDOTAI
NEXT_PUBLIC_TELEGRAM_URL=https://t.me/ChoreHome
NEXT_PUBLIC_CHORE_MINT=<optional> # $chore mint, posted at launch only; lets the agent know the token, it unlocks nothing
NEXT_PUBLIC_MAINTENANCE_MODE=false
NEXT_PUBLIC_DEBUG_MODE=false
NEXT_PUBLIC_PRIVY_APP_ID=<YOUR_PRIVY_APP_ID>
NEXT_PUBLIC_IMGBB_API_KEY=<YOUR_IMGBB_API_KEY>
NEXT_PUBLIC_EAP_RECEIVE_WALLET_ADDRESS=<optional> # only for the optional paid subscription (NEXT_PUBLIC_SUB_ENABLED, off by default)
NEXT_PUBLIC_HELIUS_RPC_URL=<YOUR_HELIUS_RPC_URL>

# DB
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin

# Privy Embedded Wallet Delegated Actions
PRIVY_SIGNING_KEY=<YOUR_PRIVY_SIGNING_KEY>
```

Optionally you can provide a [Helius](https://www.helius.dev/) private RPC URL.

### YOUR_WALLET_ENCRYPTION_KEY

Use openSSL to create this:

```
openssl rand -base64 32
```

### NEXT_PUBLIC_EAP_RECEIVE_WALLET_ADDRESS

Only used by the optional paid subscription, which is off by default. Leave it empty in local development.

## Docker setup

If you're building the image run

```
pnpm run dev:up-build
```

If you're starting from an existing image run

```
pnpm run dev:up
```

### Docker troubleshooting

Sometimes if you add a dependency you'll have to rebuild the image and clear existing volumes. If you run into issues with dependencies not adding clear your image, volumes, and build cache:

```
docker ps -a --filter "name=chore-" --format "{{.ID}}" | xargs -r docker rm -f
docker volume rm root_node_modules
docker volume rm webapp_next
docker builder prune --all
```

## First run

Sign in with Privy at `http://localhost:3000`. The server creates a wallet for your account on first sign-in; fund it with a small amount of SOL to try swaps. With the Docker setup, Prisma Studio runs at `http://localhost:5555/` if you want to look at the database.

Auto-approve limits start at 0, so every move of funds waits for your click. You can raise them in Account.
