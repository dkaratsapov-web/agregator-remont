import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

/**
 * Заголовки безопасности сайта (аудит 23.10.2026, матрица безопасности). HSTS добавляет Caddy
 * (deploy/Caddyfile), заголовки API — helmet (apps/api/src/main.ts). Флаги cookie (HttpOnly,
 * SameSite=Lax, Secure в production) проверяют session.test.ts и scripts/auth-integration.mjs.
 */
describe('security headers on every page', () => {
  it('next.config sends them for /:path*', async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((rule) => rule.source === '/:path*');
    const headers = Object.fromEntries(all!.headers.map((h) => [h.key.toLowerCase(), h.value]));
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('geolocation=()');
    // CSP со своим nonce на каждый ответ ставит proxy.ts (proxy.test.ts), не next.config.
    expect(Object.keys(headers).some((key) => key.startsWith('content-security-policy'))).toBe(
      false,
    );
  });

  it('does not reveal the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
