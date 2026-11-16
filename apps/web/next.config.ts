import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@apuestas/shared'],
  poweredByHeader: false,
  async rewrites() {
    const backendOrigin = process.env.BACKEND_PROXY_URL?.trim().replace(/\/$/, '');
    if (!backendOrigin) {
      return [];
    }
    return [
      {
        source: '/api/proxy/:path*',
        destination: `${backendOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
