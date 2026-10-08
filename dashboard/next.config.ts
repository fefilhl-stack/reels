import path from 'node:path';
import type { NextConfig } from 'next';

// Self-hosted server app: route handlers, server actions and a background worker
// (see instrumentation.ts) need a running Node.js process, so no static export here.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The repo root has its own lockfile (the landing page); this app is self-contained.
  turbopack: { root: path.resolve(process.cwd()) },
  poweredByHeader: false,
  devIndicators: { position: 'bottom-right' },
  images: { unoptimized: true },
  experimental: {
    serverActions: {
      // Cover images and form posts only; videos go through the streaming /api/upload route.
      bodySizeLimit: '8mb',
    },
  },
};

export default nextConfig;
