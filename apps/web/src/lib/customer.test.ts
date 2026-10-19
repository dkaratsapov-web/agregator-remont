import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Сессия на страницах кабинета (AUDIT_FINDINGS ARCH-3): сбой API — не выход из аккаунта. */

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  redirectedTo: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined,
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    state.redirectedTo = to;
    throw new Error('NEXT_REDIRECT');
  },
}));
// React.cache в тестах вне рендера не кэширует: каждый вызов идёт в API заново.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));

const fetchMock = vi.fn();
const { requireCustomerPage, requireUserPage, SessionCheckUnavailableError } =
  await import('./customer');
const { getCurrentUser, getSessionState } = await import('./session');

const user = { id: 'u1', name: 'Анна', role: 'CUSTOMER' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  state.cookies.clear();
  state.redirectedTo = undefined;
  state.cookies.set('ar_session', 'tok');
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

describe('getSessionState', () => {
  it('tells a missing or expired session from an API outage', async () => {
    fetchMock.mockResolvedValueOnce(json(200, user));
    expect(await getSessionState()).toEqual({ kind: 'user', user, token: 'tok' });
    fetchMock.mockResolvedValueOnce(json(401, {}));
    expect(await getSessionState()).toEqual({ kind: 'anonymous' });
    fetchMock.mockResolvedValueOnce(json(503, {}));
    expect(await getSessionState()).toEqual({ kind: 'unavailable' });
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await getSessionState()).toEqual({ kind: 'unavailable' });
    state.cookies.clear();
    expect(await getSessionState()).toEqual({ kind: 'anonymous' });
  });

  it('getCurrentUser stays lenient for the header: null on an outage', async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}));
    expect(await getCurrentUser()).toBeNull();
  });
});

describe('requireUserPage', () => {
  it('sends a signed-out visitor to login with a return path', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {}));
    await expect(requireUserPage('/account/settings')).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/login?next=%2Faccount%2Fsettings');
  });

  it('on an API outage shows the error page instead of the login page', async () => {
    fetchMock.mockResolvedValueOnce(json(502, {}));
    await expect(requireUserPage('/account')).rejects.toBeInstanceOf(SessionCheckUnavailableError);
    expect(state.redirectedTo).toBeUndefined();
  });

  it('role pages return no token for another role', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ...user, role: 'CONTRACTOR' }));
    expect(await requireCustomerPage('/account/jobs')).toMatchObject({ token: null });
    fetchMock.mockResolvedValueOnce(json(200, user));
    expect(await requireCustomerPage('/account/jobs')).toMatchObject({ token: 'tok' });
  });
});
