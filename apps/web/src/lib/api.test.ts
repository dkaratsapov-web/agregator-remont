import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getJob, getJobs } from './api';

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
