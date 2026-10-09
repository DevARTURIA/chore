import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The share card image reads its backgrounds and fonts from disk at runtime.
  outputFileTracingIncludes: {
    '/api/card/[code]': ['./src/assets/cards/**/*'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
      },
    ],
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.json$/,
      type: 'json',
    });
    return config;
  },
};

export default nextConfig;
