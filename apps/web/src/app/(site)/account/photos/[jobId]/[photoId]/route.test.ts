import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ cookie: 'tok' as string | null }));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({
    get: () => (state.cookie ? { value: state.cookie } : undefined),
  }),
}));

const fetchMock = vi.fn();
const { GET } = await import('./route');

const JOB = 'cjob0000000000000000000001';
const PHOTO = 'cpho0000000000000000000001';
const get = () =>
  GET(new Request(`http://localhost:3000/account/photos/${JOB}/${PHOTO}?size=thumb`), {
    params: Promise.resolve({ jobId: JOB, photoId: PHOTO }),
  });

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

describe('GET /account/photos/:jobId/:photoId', () => {
  it('serves the photo of a deal only to its party, and the browser asks again each time', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } }),
    );
    const res = await get();
    expect(res.status).toBe(200);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')).toBe('Bearer tok');
    // Фото чужой квартиры: после выхода из аккаунта на общем компьютере оно не должно
    // открываться из кеша браузера (ревью garantych-reviewer).
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('401 without a session, without calling the API', async () => {
    state.cookie = null;
    expect((await get()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
