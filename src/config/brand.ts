/**
 * Central brand configuration: static branding values only.
 * URLs and the token mint are deployment configuration (see .env.example).
 */
export const brand = {
  // The name is always lowercase and bold; the ticker keeps its $ (brand rules).
  name: process.env.NEXT_PUBLIC_APP_NAME || 'chore',
  ticker: '$chore',
  tagline: 'Say it once. Consider it done.',
  description: 'Open-source chat agent for Solana.',
  website: process.env.NEXT_PUBLIC_APP_URL || '',
  docsUrl: process.env.NEXT_PUBLIC_DOCS_URL || '',
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || '',
  twitterUrl: process.env.NEXT_PUBLIC_X_URL || '',
  telegramUrl: process.env.NEXT_PUBLIC_TELEGRAM_URL || '',
  tokenMint: process.env.NEXT_PUBLIC_CHORE_MINT || '',
};
