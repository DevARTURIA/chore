import { Metadata } from 'next';

import { HomeContent } from './home-content';

export const metadata: Metadata = {
  title: 'Home',
  description: 'Your Solana chores, handled.',
};

export default function HomePage() {
  return <HomeContent />;
}
