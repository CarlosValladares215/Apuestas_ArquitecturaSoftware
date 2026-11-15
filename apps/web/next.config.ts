import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@apuestas/shared'],
  poweredByHeader: false,
};

export default nextConfig;
