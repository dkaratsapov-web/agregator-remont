import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
  set: [] as { name: string; value: string; maxAge?: number }[],
  redirectedTo: undefined as string | undefined,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { name, value: state.cookies.get(name) } : undefined,
    set: (name: string, value: string, options: { maxAge?: number }) =>
      state.set.push({ name, value, maxAge: options.maxAge }),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    state.redirectedTo = to;
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const fetchMock = vi.fn();
const { deleteAccountAction } = await import('./actions');
const { FOREIGN_ORIGIN } = await import('@/lib/action-guard');

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const filled = { password: 'correct-horse-battery', confirm: 'on' };

beforeEach(() => {
  state.headers.clear();
  state.cookies.clear();
  state.set.length = 0;
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

describe('deleteAccountAction', () => {
  it('deletes with the password, clears the session cookie and goes to the login page', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteAccountAction({}, form(filled))).rejects.toThrow('NEXT_REDIRECT');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/me/delete');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ password: 'correct-horse-battery' });
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(state.set).toEqual([{ name: 'ar_session', value: '', maxAge: 0 }]);
    expect(state.redirectedTo).toBe('/login?deleted=1');
  });

  it('needs the confirmation box and a password; refuses a foreign origin', async () => {
    expect(await deleteAccountAction({}, form({ password: 'x' }))).toMatchObject({
      error: expect.stringContaining('Подтвердите'),
    });
    expect(await deleteAccountAction({}, form({ confirm: 'on' }))).toMatchObject({
      error: 'Введите пароль',
    });
    state.headers.set('origin', 'https://evil.example');
    expect((await deleteAccountAction({}, form(filled))).error).toBe(FOREIGN_ORIGIN);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, { code: 'PASSWORD_INVALID', message: 'Пароль указан неверно' }, 'Пароль указан неверно'],
    [
      409,
      { code: 'ACCOUNT_HAS_ACTIVE_DEALS', message: 'Есть заказ в работе. Завершите…' },
      'Есть заказ в работе. Завершите…',
    ],
  ])('API %i: shows the message, the session stays', async (status, body, message) => {
    fetchMock.mockResolvedValue(json(status, body));
    expect(await deleteAccountAction({}, form(filled))).toEqual({ error: message });
    expect(state.set).toEqual([]);
    expect(state.redirectedTo).toBeUndefined();
  });
});
