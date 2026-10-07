import type { NextConfig } from 'next';

// Static export: `npm run build` writes a plain HTML/CSS/JS site to `out/`.
// For GitHub Pages under a sub-path set NEXT_PUBLIC_BASE_PATH=/repo-name.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
