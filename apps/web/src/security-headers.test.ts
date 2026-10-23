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
    const csp = Object.entries(headers).find(([key]) => key.startsWith('content-security-policy'));
    expect(csp?.[1]).toContain("frame-ancestors 'none'");
    expect(csp?.[1]).toContain("object-src 'none'");
    expect(csp?.[1]).toContain("form-action 'self'");
  });

  it('does not reveal the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
