import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ cookie: 'tok' as string | null }));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }),
}));

const fetchMock = vi.fn();
const { GET } = await import('./route');

beforeEach(() => {
  state.cookie = 'tok';
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe('GET /account/export', () => {
  it('passes the file from the API as a download, not cached', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"account":{}}', {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': 'attachment; filename="garantych-100001-2026-10-23.json"',
        },
      }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"account":{}}');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="garantych-100001-2026-10-23.json"',
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe('Bearer tok');
  });

  it('without a session: to the login page, API not called', async () => {
    state.cookie = null;
    const res = await GET();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login?next=%2Faccount%2Fsettings');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, '/login?next=%2Faccount%2Fsettings'],
    [429, '/account/settings?export=limit#data'],
    [500, '/account/settings?export=failed#data'],
  ])('API %i: redirect to %s', async (status, location) => {
    fetchMock.mockResolvedValue(new Response('{}', { status }));
    const res = await GET();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(location);
  });
});
