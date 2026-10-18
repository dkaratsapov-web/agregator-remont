import path from 'node:path';
import type { NextConfig } from 'next';
import { buildCsp, CSP_HEADER } from './src/lib/csp';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: CSP_HEADER, value: buildCsp({ dev: process.env.NODE_ENV !== 'production' }) },
];

const nextConfig: NextConfig = {
  // Docker-образ собирается с NEXT_OUTPUT=standalone; dev и CI используют обычную сборку.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: path.join(__dirname, '../../') }
    : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Кадры пролёта на главной: папка версионируется (flight-v1, flight-v2…), файлы не меняются.
        source: '/landing/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
