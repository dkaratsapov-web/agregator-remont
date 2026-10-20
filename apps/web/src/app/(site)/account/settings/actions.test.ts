import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
  redirectedTo: undefined as string | undefined,
  revalidated: [] as string[],
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
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => state.revalidated.push(path) }));

const fetchMock = vi.fn();
const {
  passwordAction,
  preferencesAction,
  profileAction,
  revokeOthersAction,
  revokeSessionAction,
} = await import('./actions');

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const sent = (call = 0) => {
  const [url, init] = fetchMock.mock.calls[call];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
};

beforeEach(() => {
  state.headers.clear();
  state.cookies.clear();
  state.redirectedTo = undefined;
  state.revalidated = [];
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

describe('profileAction', () => {
  it('saves name, phone and city; empty phone and city remove the value', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'u1' }));
    const result = await profileAction({}, form({ name: 'Анна', phone: '', city: '' }));
    expect(result).toEqual({ done: 'Профиль сохранён' });
    expect(sent()).toMatchObject({
      url: 'http://api.test/v1/me',
      method: 'PATCH',
      body: { name: 'Анна', phone: null, city: null },
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(state.revalidated).toContain('/');
  });

  it('keeps typed values on an API error and refuses a foreign origin', async () => {
    fetchMock.mockResolvedValue(json(400, { message: ['Телефон: неверный формат'] }));
    const result = await profileAction({}, form({ name: 'Анна', phone: '12', city: 'Тула' }));
    expect(result.error).toMatch(/Телефон/);
    expect(result.values).toEqual({ name: 'Анна', phone: '12', city: 'Тула' });

    fetchMock.mockClear();
    state.headers.set('origin', 'https://evil.example');
    expect((await profileAction({}, form({ name: 'Анна' }))).error).toMatch(/Запрос отклонён/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends an expired session to login', async () => {
    fetchMock.mockResolvedValue(json(401, {}));
    await expect(profileAction({}, form({ name: 'Анна' }))).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/login?next=%2Faccount%2Fsettings');
  });
});

describe('preferencesAction', () => {
  it('sends only allowed values', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'u1' }));
    await preferencesAction({}, form({ theme: 'dark', scale: 'huge', motion: 'reduced' }));
    expect(sent().body).toEqual({ theme: 'dark', motion: 'reduced' });
  });
});

describe('passwordAction', () => {
  it('checks the repeat before calling the API', async () => {
    const result = await passwordAction(
      {},
      form({ currentPassword: 'old', newPassword: 'new-password-1', confirmPassword: 'other' }),
    );
    expect(result.error).toMatch(/не совпадают/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('changes the password and explains the rate limit', async () => {
    const fields = {
      currentPassword: 'old-password-1',
      newPassword: 'new-password-1',
      confirmPassword: 'new-password-1',
    };
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await passwordAction({}, form(fields))).done).toMatch(/Пароль изменён/);
    expect(sent()).toMatchObject({
      url: 'http://api.test/v1/me/password',
      method: 'POST',
      body: { currentPassword: 'old-password-1', newPassword: 'new-password-1' },
    });

    fetchMock.mockResolvedValueOnce(json(429, {}));
    expect((await passwordAction({}, form(fields))).error).toMatch(/Слишком много попыток/);
    fetchMock.mockResolvedValueOnce(json(400, { message: 'Неверный текущий пароль' }));
    expect((await passwordAction({}, form(fields))).error).toBe('Неверный текущий пароль');
  });
});

describe('sessions', () => {
  it('ends one session by a valid id only', async () => {
    expect((await revokeSessionAction('../x', {}, form({}))).error).toMatch(/не найден/);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await revokeSessionAction('s1', {}, form({}))).done).toBe('Сеанс завершён');
    expect(sent()).toMatchObject({ url: 'http://api.test/v1/me/sessions/s1', method: 'DELETE' });
  });

  it('reports how many other sessions were ended', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { revoked: 2 }));
    expect((await revokeOthersAction({}, form({}))).done).toBe('Завершено сеансов: 2');
    fetchMock.mockResolvedValueOnce(json(200, { revoked: 0 }));
    expect((await revokeOthersAction({}, form({}))).done).toBe('Других сеансов нет');
  });

  it('without a session goes to login and never calls the API', async () => {
    state.cookies.clear();
    await expect(revokeOthersAction({}, form({}))).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectedTo).toBe('/login?next=%2Faccount%2Fsettings');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
