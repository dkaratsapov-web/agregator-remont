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

describe('GET /account/notifications/summary', () => {
  it('sums notifications and report decisions, not cached', async () => {
    fetchMock.mockResolvedValue(Response.json({ unread: 3, reportDecisions: 2 }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unread: 5 });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe('Bearer tok');
  });

  it('401 without a session, without calling the API', async () => {
    state.cookie = null;
    expect((await GET()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 when the API rejects the session; 502 without details when it fails', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }));
    expect((await GET()).status).toBe(401);
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ unread: null });
  });
});
