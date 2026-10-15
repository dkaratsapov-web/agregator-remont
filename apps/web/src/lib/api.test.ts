import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getJob, getJobs, getMe, loginUser, logoutSession, registerUser } from './api';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('getJobs', () => {
  it('requests the paginated endpoint without caching', async () => {
    fetchMock.mockResolvedValue(json(200, { items: [], page: 2, limit: 12, total: 0 }));
    const result = await getJobs({ page: 2, limit: 12, category: 'PLUMBING' });
    expect(result.page).toBe(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/jobs?page=2&limit=12&category=PLUMBING');
    expect(init.cache).toBe('no-store');
  });

  it('throws ApiError on non-2xx', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    await expect(getJobs({ page: 1, limit: 12 })).rejects.toMatchObject({ status: 500 });
  });

  it('wraps network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getJobs({ page: 1, limit: 12 })).rejects.toBeInstanceOf(ApiError);
  });

  it('fails clearly when API_URL is missing', async () => {
    vi.stubEnv('API_URL', '');
    await expect(getJobs({ page: 1, limit: 12 })).rejects.toThrow('API_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getJob', () => {
  it('encodes the id and returns the job', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'a/b' }));
    await expect(getJob('a/b')).resolves.toEqual({ id: 'a/b' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/v1/jobs/a%2Fb');
  });

  it('returns null on 404 and throws on other errors', async () => {
    fetchMock.mockResolvedValueOnce(json(404, {}));
    await expect(getJob('missing')).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(json(503, {}));
    await expect(getJob('x')).rejects.toMatchObject({ status: 503 });
  });
});

describe('auth calls', () => {
  const session = { user: { id: 'u1' }, token: 't', expiresAt: '2026-01-01T00:00:00.000Z' };

  it('posts JSON and forwards the visitor IP', async () => {
    fetchMock.mockResolvedValue(json(201, session));
    await registerUser(
      { email: 'a@b.ru', password: 'password123', name: 'Ив', role: 'CUSTOMER' },
      '203.0.113.7',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/auth/register');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Forwarded-For']).toBe('203.0.113.7');
    expect(JSON.parse(init.body)).toMatchObject({ email: 'a@b.ru', role: 'CUSTOMER' });
  });

  it('exposes the API message for client errors', async () => {
    fetchMock.mockResolvedValue(json(401, { message: 'Неверный email или пароль' }));
    await expect(loginUser({ email: 'a@b.ru', password: 'x' })).rejects.toMatchObject({
      status: 401,
      userMessage: 'Неверный email или пароль',
    });
    fetchMock.mockResolvedValue(json(400, { message: ['Укажите корректный email'] }));
    await expect(loginUser({ email: 'x', password: 'x' })).rejects.toMatchObject({
      userMessage: 'Укажите корректный email',
    });
  });

  it('sends the session as a Bearer token and maps 401 to null', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {}));
    await expect(getMe('tok')).resolves.toBeNull();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it.each([
    [204, 'revoked'],
    [401, 'invalid'],
    [500, 'failed'],
    [503, 'failed'],
    [429, 'failed'],
  ])('maps logout status %i to %s', async (status, expected) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(logoutSession('tok')).resolves.toBe(expected);
  });

  it('reports logout as failed when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(logoutSession('tok')).resolves.toBe('failed');
  });
});
