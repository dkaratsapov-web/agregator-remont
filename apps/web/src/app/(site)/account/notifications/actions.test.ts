import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
  redirectedTo: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    state.redirectedTo = to;
    throw new Error('NEXT_REDIRECT');
  },
}));

const fetchMock = vi.fn();
const { markAllReadAction, markJobSeenAction } = await import('./actions');

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const summary = { unread: 0, jobs: [] };

beforeEach(() => {
  state.headers.clear();
  state.cookies.clear();
  state.redirectedTo = undefined;
  state.headers.set('origin', 'http://localhost:3000');
  state.headers.set('host', 'localhost:3000');
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

describe('markAllReadAction', () => {
  it('marks everything read and returns to the list with a notice', async () => {
    fetchMock.mockResolvedValue(json(200, summary));
    await expect(markAllReadAction({}, new FormData())).rejects.toThrow('NEXT_REDIRECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/me/notifications/read');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ all: true });
    expect(state.redirectedTo).toBe('/account/notifications?read=1');
  });

  it('rejects foreign origins and sends an expired session to login', async () => {
    state.headers.set('origin', 'https://evil.example');
    expect((await markAllReadAction({}, new FormData())).error).toMatch(/Запрос отклонён/);
    expect(fetchMock).not.toHaveBeenCalled();

    state.headers.set('origin', 'http://localhost:3000');
    fetchMock.mockResolvedValue(json(401, { message: 'Нет сессии' }));
    await expect(markAllReadAction({}, new FormData())).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/login?next=%2Faccount%2Fnotifications');
  });

  it('shows a plain error when the API fails', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    expect((await markAllReadAction({}, new FormData())).error).toMatch(/временно недоступен/);
  });
});

describe('markJobSeenAction', () => {
  it('marks the notifications of one job', async () => {
    fetchMock.mockResolvedValue(json(200, summary));
    expect(await markJobSeenAction('job1')).toEqual({ ok: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ jobId: 'job1' });
  });

  it('ignores bad ids, foreign origins and API failures without throwing', async () => {
    expect(await markJobSeenAction('../x')).toEqual({ ok: false });
    state.headers.set('origin', 'https://evil.example');
    expect(await markJobSeenAction('job1')).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();

    state.headers.set('origin', 'http://localhost:3000');
    fetchMock.mockResolvedValue(json(500, {}));
    expect(await markJobSeenAction('job1')).toEqual({ ok: false });
  });
});
