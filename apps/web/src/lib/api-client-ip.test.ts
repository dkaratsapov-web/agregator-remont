import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Адрес посетителя уходит в API с каждым запросом страницы, а не только из Server Actions: иначе
 * лимит запросов API (120 в минуту на маршрут) считается по адресу web и один на всех
 * посетителей — фото и переписка ломаются у всех (ревью garantych-reviewer).
 */
const state = vi.hoisted(() => ({ forwardedFor: '203.0.113.7' as string | null }));

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name === 'x-forwarded-for' ? state.forwardedFor : null),
  }),
}));

const fetchMock = vi.fn();
const { getJobs, getMe, fetchJobPhoto } = await import('./api');

const sentIp = () => new Headers(fetchMock.mock.calls[0][1].headers).get('x-forwarded-for');

beforeEach(() => {
  state.forwardedFor = '203.0.113.7';
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test');
  vi.stubEnv('WEB_TRUST_PROXY_HOPS', '1');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

describe('client address for API rate limits on page reads', () => {
  it('catalog, profile and photo requests carry the visitor address', async () => {
    fetchMock.mockResolvedValue(Response.json({ items: [], page: 1, limit: 12, total: 0 }));
    await getJobs({ page: 1, limit: 12 });
    expect(sentIp()).toBe('203.0.113.7');

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(Response.json({ id: 'u1' }));
    await getMe('tok');
    expect(sentIp()).toBe('203.0.113.7');

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1])));
    await fetchJobPhoto('tok', 'cjob0000000000000000000001', 'cpho0000000000000000000001', 'thumb');
    expect(sentIp()).toBe('203.0.113.7');
  });

  it('only the address our proxy appended is trusted', async () => {
    // Клиент прислал свой X-Forwarded-For, Caddy дописал настоящий адрес в конец.
    state.forwardedFor = '1.2.3.4, 198.51.100.9';
    fetchMock.mockResolvedValue(Response.json({ items: [], page: 1, limit: 12, total: 0 }));
    await getJobs({ page: 1, limit: 12 });
    expect(sentIp()).toBe('198.51.100.9');
  });

  it('without trusted proxies (WEB_TRUST_PROXY_HOPS unset) no address is sent', async () => {
    vi.stubEnv('WEB_TRUST_PROXY_HOPS', '');
    fetchMock.mockResolvedValue(Response.json({ items: [], page: 1, limit: 12, total: 0 }));
    await getJobs({ page: 1, limit: 12 });
    expect(sentIp()).toBeNull();
  });
});
