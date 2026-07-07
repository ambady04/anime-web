import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Forward specific anime API routes to the external API
      // NOTE: /api/video is intentionally excluded — it's our local streaming proxy
      {
        source: '/api/home',
        destination: 'https://anime-api-six-psi.vercel.app/api/home',
      },
      {
        source: '/api/details',
        destination: 'https://anime-api-six-psi.vercel.app/api/details',
      },
      {
        source: '/api/stream',
        destination: 'https://anime-api-six-psi.vercel.app/api/stream',
      },
      {
        source: '/api/search',
        destination: 'https://anime-api-six-psi.vercel.app/api/search',
      },
      {
        source: '/api/category',
        destination: 'https://anime-api-six-psi.vercel.app/api/category',
      },
    ];
  },
};

export default nextConfig;
