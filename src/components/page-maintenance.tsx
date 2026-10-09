import Link from 'next/link';

import { brand } from '@/config/brand';

import { AgentMark } from './logo';

export default function MaintenanceIndex() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <AgentMark etat="dort" size={64} title={brand.name} />
      <p className="text-lg text-foreground">
        <span className="font-extrabold">{brand.name}</span> is resting.
        {brand.twitterUrl && (
          <>
            {' '}
            Updates on{' '}
            <Link
              href={brand.twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              X
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}
