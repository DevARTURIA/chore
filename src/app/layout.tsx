import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

import AuthProviders from '@/components/provider-auth';
import { ThemeProvider } from '@/components/provider-theme';
import { Toaster } from '@/components/ui/sonner';
import { brand } from '@/config/brand';
import { cn } from '@/lib/utils';

import './globals.css';

const sans = Schibsted_Grotesk({
  variable: '--font-sans',
  subsets: ['latin'],
});

const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const siteTitle = `${brand.name} — ${brand.tagline}`;
const siteDescription = `${brand.description} ${brand.tagline}`;

export const metadata: Metadata = {
  metadataBase: brand.website ? new URL(brand.website) : undefined,
  applicationName: brand.name,
  title: {
    template: `%s | ${brand.name}`,
    default: siteTitle,
  },
  description: siteDescription,
  openGraph: {
    type: 'website',
    siteName: brand.name,
    title: siteTitle,
    description: siteDescription,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: brand.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/og.png'],
  },

  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/brand/apple-touch-180.png',
  },
};

/** One dark theme: the browser chrome and native controls follow it. */
export const viewport: Viewport = {
  themeColor: '#0A0C0A',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={cn(
          `${sans.variable} ${mono.variable}`,
          'overflow-x-hidden font-sans antialiased',
        )}
      >
        <AuthProviders>
          <ThemeProvider
            attribute="class"
            forcedTheme="dark"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            <main className="sticky bottom-0 overflow-hidden md:overflow-visible">
              {children}
              <Toaster />
            </main>
          </ThemeProvider>
        </AuthProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
