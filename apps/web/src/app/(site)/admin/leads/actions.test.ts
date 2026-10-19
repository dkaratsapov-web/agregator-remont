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
const { setLeadProcessedAction } = await import('./actions');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const toggle = (id: string, processed: boolean, back: string) =>
  setLeadProcessedAction(id, processed, back, {}, new FormData());

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

describe('setLeadProcessedAction', () => {
  it('marks the lead and returns to the list', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'l1' }));
    await expect(toggle('l1', true, '/admin/leads?status=new')).rejects.toThrow('NEXT_REDIRECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect([url, init.method, JSON.parse(init.body)]).toEqual([
      'http://api.test/v1/admin/leads/l1',
      'PATCH',
      { processed: true },
    ]);
    expect(state.redirectedTo).toBe('/admin/leads?status=new');
  });

  it('never redirects to another site', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'l1' }));
    await expect(toggle('l1', false, 'https://evil.example/x')).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/account');
  });

  it('explains role and missing lead errors; refuses bad ids and foreign origins', async () => {
    fetchMock.mockResolvedValueOnce(json(403, {}));
    expect((await toggle('l1', true, '/admin/leads')).error).toMatch(/только администратору/);
    fetchMock.mockResolvedValueOnce(json(404, {}));
    expect((await toggle('l1', true, '/admin/leads')).error).toBe('Заявка не найдена.');
    fetchMock.mockClear();
    expect((await toggle('a/b', true, '/admin/leads')).error).toBe('Заявка не найдена.');
    state.headers.set('origin', 'https://evil.example');
    expect((await toggle('l1', true, '/admin/leads')).error).toMatch(/Запрос отклонён/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
