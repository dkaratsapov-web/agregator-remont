import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gateConfig, issueGatePass } from '@/lib/gate';

/** Проверка пропуска тестировщика для Caddy forward_auth (deploy/Caddyfile). */

const state = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined,
  }),
}));

const { GET } = await import('./route');

// bcrypt-хеш нужного формата; сам пароль здесь не проверяется.
const HASH = `$2a$10$${'a'.repeat(53)}`;
const check = (headers: Record<string, string>) =>
  GET(new Request('http://localhost:3000/gate/check', { headers }));

beforeEach(() => {
  state.cookies.clear();
  vi.stubEnv('BASIC_AUTH_USER', 'tester');
  vi.stubEnv('BASIC_AUTH_HASH', HASH);
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /gate/check', () => {
  it('lets a valid pass through', async () => {
    state.cookies.set('ar_gate', issueGatePass(gateConfig()!));
    expect((await check({ 'sec-fetch-mode': 'navigate' })).status).toBe(204);
  });

  it('sends a page navigation without a pass to /gate with a safe return path', async () => {
    const res = await check({ 'sec-fetch-mode': 'navigate', 'x-forwarded-uri': '/jobs?q=1' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/gate?next=%2Fjobs%3Fq%3D1');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const evil = await check({ 'sec-fetch-mode': 'navigate', 'x-forwarded-uri': '//evil.example' });
    expect(evil.headers.get('location')).toBe('/gate?next=%2Faccount');
  });

  it('answers background requests and forged passes with a bare 401', async () => {
    const fetchLike = await check({ 'sec-fetch-mode': 'cors' });
    expect(fetchLike.status).toBe(401);
    expect(fetchLike.headers.get('www-authenticate')).toBeNull();

    state.cookies.set('ar_gate', 'v1.9999999999.forged');
    expect((await check({ 'sec-fetch-mode': 'cors', rsc: '1' })).status).toBe(401);
  });

  it('keeps the closed part closed when the login is not configured', async () => {
    state.cookies.set('ar_gate', issueGatePass(gateConfig()!));
    vi.stubEnv('BASIC_AUTH_HASH', '');
    expect((await check({ 'sec-fetch-mode': 'cors' })).status).toBe(401);
  });
});
