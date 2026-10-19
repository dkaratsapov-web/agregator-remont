import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Минимальные подмены окружения Next.js: заголовки запроса, cookie и redirect.
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
    set: (name: string, value: string, opts?: { maxAge?: number }) => {
      if (opts?.maxAge === 0) state.cookies.delete(name);
      else state.cookies.set(name, value);
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    state.redirectedTo = to;
    throw new Error('NEXT_REDIRECT');
  },
}));

const fetchMock = vi.fn();
const { loginAction, logoutAction, registerAction } = await import('./actions');

const SESSION = 'ar_session';
const sameOrigin = () => {
  state.headers.set('origin', 'http://localhost:3000');
  state.headers.set('host', 'localhost:3000');
};

beforeEach(() => {
  state.headers.clear();
  state.cookies.clear();
  state.redirectedTo = undefined;
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

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};

describe('loginAction', () => {
  it('revokes the previous session of this browser before setting the new one', async () => {
    sameOrigin();
    state.cookies.set(SESSION, 'old-token');
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/v1/auth/login')
        ? new Response(
            JSON.stringify({
              token: 'new-token',
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
              user: {},
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        : new Response(null, { status: 204 }),
    );
    await expect(
      loginAction({}, form({ email: 'a@example.ru', password: 'correct-horse-battery' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    const logout = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/v1/auth/logout'));
    expect(logout?.[1].headers.Authorization).toBe('Bearer old-token');
    expect(state.cookies.get(SESSION)).toBe('new-token');
  });
});

describe('logoutAction', () => {
  it('clears the cookie and redirects when the API revoked the session', async () => {
    sameOrigin();
    state.cookies.set(SESSION, 'tok');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(logoutAction({}, form({}))).rejects.toThrow('NEXT_REDIRECT');
    expect(state.cookies.has(SESSION)).toBe(false);
    expect(state.redirectedTo).toBe('/');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it.each([
    ['API 500', () => fetchMock.mockResolvedValue(new Response(null, { status: 500 }))],
    ['API timeout', () => fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'))],
  ])('keeps the cookie and reports an error on %s', async (_name, arrange) => {
    sameOrigin();
    state.cookies.set(SESSION, 'tok');
    arrange();
    const result = await logoutAction({}, form({}));
    expect(result.error).toMatch(/Не удалось выйти/);
    expect(state.cookies.get(SESSION)).toBe('tok');
    expect(state.redirectedTo).toBeUndefined();
  });

  it('clears a cookie whose session is already invalid', async () => {
    sameOrigin();
    state.cookies.set(SESSION, 'tok');
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(logoutAction({}, form({}))).rejects.toThrow('NEXT_REDIRECT');
    expect(state.cookies.has(SESSION)).toBe(false);
  });

  it('rejects a cross-origin request without touching the session', async () => {
    state.headers.set('origin', 'https://evil.example');
    state.headers.set('host', 'localhost:3000');
    state.cookies.set(SESSION, 'tok');
    const result = await logoutAction({}, form({}));
    expect(result.error).toMatch(/Запрос отклонён/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.cookies.get(SESSION)).toBe('tok');
  });
});

describe('loginAction', () => {
  it('rejects a request without Origin before calling the API', async () => {
    state.headers.set('host', 'localhost:3000');
    const result = await loginAction({}, form({ email: 'a@b.ru', password: 'password-123' }));
    expect(result.error).toMatch(/Запрос отклонён/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets the session cookie and redirects to a safe next path', async () => {
    sameOrigin();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ user: {}, token: 'new-token', expiresAt: '2030-01-01T00:00:00.000Z' }),
        { status: 200 },
      ),
    );
    await expect(
      loginAction({}, form({ email: 'a@b.ru', password: 'password-123', next: '//evil.example' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(state.cookies.get(SESSION)).toBe('new-token');
    expect(state.redirectedTo).toBe('/account');
  });
});

describe('field errors (UX-5)', () => {
  it('registration reports every invalid field at once without calling the API', async () => {
    sameOrigin();
    const result = await registerAction(
      {},
      form({ name: 'А', email: 'не-email', password: 'short', role: 'CUSTOMER' }),
    );
    expect(Object.keys(result.fields ?? {}).sort()).toEqual(['email', 'name', 'password']);
    expect(result.values).toMatchObject({ name: 'А', email: 'не-email' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a taken email is marked on the email field', async () => {
    sameOrigin();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Email уже зарегистрирован' }), { status: 409 }),
    );
    const result = await registerAction(
      {},
      form({ name: 'Анна', email: 'a@b.ru', password: 'long-enough-1', role: 'CUSTOMER' }),
    );
    expect(result.fields?.email).toMatch(/уже зарегистрирован/);
  });

  it('wrong credentials mark the password field', async () => {
    sameOrigin();
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    const result = await loginAction({}, form({ email: 'a@b.ru', password: 'password-123' }));
    expect(result.error).toMatch(/Неверный email или пароль/);
    expect(result.fields?.password).toBeTruthy();
    expect(result.values).toEqual({ email: 'a@b.ru' });
  });
});
