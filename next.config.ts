import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Image optimization is disabled — Cloudflare Workers doesn't support
    // Next.js built-in image optimization. Images are served directly from CF Assets.
    images: {
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 86400,
        unoptimized: true,
    },

    // NOTE: rewrites() and headers() are intentionally omitted here.
    // On Cloudflare Workers (via @opennextjs/cloudflare), there is no Next.js
    // server layer that processes these — they are silently ignored at runtime.
    //
    // API routing:  handled by src/app/api/[...slug]/route.ts (catch-all proxy)
    // Page headers: handled by src/proxy.ts (edge proxy function)
    // Cache headers: set directly in each API route handler
};

export default nextConfig;
