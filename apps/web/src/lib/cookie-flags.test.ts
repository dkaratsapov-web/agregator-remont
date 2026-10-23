import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Флаги cookie с токенами (аудит 23.10.2026, матрица безопасности). В production: префикс
 * __Host- (только HTTPS, только этот хост, путь /), HttpOnly (недоступен JavaScript), Secure,
 * SameSite=Lax (не уходит с фоновыми запросами чужих сайтов).
 */

const jar = vi.hoisted(() => ({ set: [] as { name: string; options: Record<string, unknown> }[] }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (name: string, _value: string, options: Record<string, unknown>) =>
      jar.set.push({ name, options }),
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock('./api', () => ({ getMe: vi.fn(), logoutSession: vi.fn() }));

beforeEach(() => {
  jar.set.length = 0;
  vi.stubEnv('NODE_ENV', 'production');
});
afterEach(() => vi.unstubAllEnvs());

const expectStrict = (name: string, options: Record<string, unknown>) => {
  expect(name.startsWith('__Host-')).toBe(true);
  expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  expect(options.domain).toBeUndefined();
};

describe('token cookies in production', () => {
  it('session', async () => {
    const { setSessionCookie } = await import('./session');
    await setSessionCookie('token', new Date(Date.now() + 60_000).toISOString());
    expect(jar.set).toHaveLength(1);
    expectStrict(jar.set[0].name, jar.set[0].options);
  });

  it('password reset link', async () => {
    const { saveResetToken } = await import('./password-reset');
    await saveResetToken('a'.repeat(43));
    expect(jar.set).toHaveLength(1);
    expectStrict(jar.set[0].name, jar.set[0].options);
    expect(jar.set[0].options.maxAge).toBeLessThanOrEqual(30 * 60);
  });
});
