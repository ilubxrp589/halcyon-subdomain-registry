import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disable strict mode to prevent double-mount issues with web3modal
  images: {
    localPatterns: [
      {
        pathname: '/api/proxy/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    return [
      { source: '/docs', destination: '/wiki', permanent: true },
      { source: '/docs/getting-started', destination: '/wiki/getting-started/buy-first-domain', permanent: true },
      { source: '/docs/nft-customization', destination: '/wiki/guides/nft-customization', permanent: true },
      { source: '/docs/how-it-works', destination: '/wiki/concepts/how-it-works', permanent: true },
      { source: '/docs/api', destination: '/wiki/developers/api', permanent: true },
      { source: '/docs/architecture', destination: '/wiki/developers/architecture', permanent: true },
    ];
  },
};

export default nextConfig;
