import path from 'node:path';
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Content-Security-Policy со своим nonce на каждый ответ ставит src/proxy.ts.
];

const nextConfig: NextConfig = {
  // Docker-образ собирается с NEXT_OUTPUT=standalone; dev и CI используют обычную сборку.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: path.join(__dirname, '../../') }
    : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Фото к сообщениям и сдаче этапа: до 5 файлов по 8 МБ, но не больше 26 МБ на запрос
    // (PHOTO_LIMITS). Caddy пропускает такие тела только на страницах заказа и «Хода работ»
    // (deploy/Caddyfile), остальные запросы — до 8 МБ.
    serverActions: { bodySizeLimit: '27mb' },
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Видео пролёта на главной: папка версионируется (flight-v3, flight-v4…), файлы не меняются.
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
