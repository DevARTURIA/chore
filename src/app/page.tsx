'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useLogin } from '@privy-io/react-auth';
import { GitHubLogoIcon } from '@radix-ui/react-icons';
import { RiTelegramFill, RiTwitterXFill } from '@remixicon/react';
import { BookOpenIcon } from 'lucide-react';

import { AgentEye } from '@/components/agent-eye';
import { Brand } from '@/components/logo';
import BlurFade from '@/components/ui/blur-fade';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';

const links = [
  { label: 'GitHub', href: brand.githubUrl, icon: GitHubLogoIcon },
  { label: 'Docs', href: brand.docsUrl, icon: BookOpenIcon },
  { label: 'X', href: brand.twitterUrl, icon: RiTwitterXFill },
  { label: 'Telegram', href: brand.telegramUrl, icon: RiTelegramFill },
].filter((link) => link.href);

export default function Home() {
  const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true';
  const router = useRouter();
  let { login } = useLogin({
    onComplete: async () => {
      router.push('/home');
    },
  });

  if (isMaintenanceMode) {
    login = () => {
      window.location.href = brand.twitterUrl;
    };
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        <Button variant="outline" size="sm" onClick={login}>
          Sign in
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <BlurFade delay={0.1}>
          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            <AgentEye etat="repos" size={56} />
            <h1 className="mt-8 text-4xl font-bold tracking-tight sm:text-5xl">
              {brand.tagline}
            </h1>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Say what you want done on Solana. It prepares each transaction and
              waits for your confirmation.
            </p>
            <Button size="lg" className="mt-8 min-w-[180px]" onClick={login}>
              Get started
            </Button>
          </div>
        </BlurFade>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 border-t px-6 py-5 text-sm text-muted-foreground">
        <span>
          <span className="font-extrabold text-foreground">{brand.name}</span>{' '}
          is open source.
        </span>
        {links.length > 0 && (
          <nav className="flex items-center gap-5">
            {links.map(({ label, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        )}
      </footer>
    </div>
  );
}
