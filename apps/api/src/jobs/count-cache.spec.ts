import { CountCache } from './count-cache';

/** Число «всего» для каталога (docs/audit/LOAD_TEST_REPORT.md, вывод 3). */
describe('CountCache', () => {
  const setup = (opts: { min?: number; ttlMs?: number; maxKeys?: number } = {}) => {
    let now = 1_000_000;
    const cache = new CountCache({ min: 1000, ttlMs: 5000, maxKeys: 3, ...opts }, () => now);
    return { cache, tick: (ms: number) => (now += ms) };
  };

  it('a big count is computed once for many concurrent requests', async () => {
    const { cache } = setup();
    const count = jest.fn(
      () => new Promise<number>((resolve) => setTimeout(() => resolve(100_000), 5)),
    );
    const totals = await Promise.all(Array.from({ length: 50 }, () => cache.get('all', count)));
    expect(new Set(totals)).toEqual(new Set([100_000]));
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('keeps a big count for the ttl, then counts again', async () => {
    const { cache, tick } = setup();
    const count = jest.fn().mockResolvedValueOnce(5000).mockResolvedValueOnce(5001);
    expect(await cache.get('all', count)).toBe(5000);
    tick(4999);
    expect(await cache.get('all', count)).toBe(5000);
    tick(2);
    expect(await cache.get('all', count)).toBe(5001);
    expect(count).toHaveBeenCalledTimes(2);
  });

  it('a small count is always exact (a new job is counted at once)', async () => {
    const { cache } = setup();
    const count = jest.fn().mockResolvedValueOnce(999).mockResolvedValueOnce(1000);
    expect(await cache.get('all', count)).toBe(999);
    expect(await cache.get('all', count)).toBe(1000);
    expect(count).toHaveBeenCalledTimes(2);
  });

  it('different filters are counted separately', async () => {
    const { cache } = setup();
    expect(await cache.get('a', async () => 2000)).toBe(2000);
    expect(await cache.get('b', async () => 3000)).toBe(3000);
    expect(await cache.get('a', async () => 0)).toBe(2000);
  });

  it('a failed count is not cached', async () => {
    const { cache } = setup();
    await expect(cache.get('all', () => Promise.reject(new Error('db down')))).rejects.toThrow(
      'db down',
    );
    expect(await cache.get('all', async () => 4000)).toBe(4000);
  });

  it('holds at most maxKeys filters, dropping the oldest', async () => {
    const { cache } = setup({ maxKeys: 2 });
    await cache.get('a', async () => 2000);
    await cache.get('b', async () => 2000);
    await cache.get('c', async () => 2000);
    expect(cache.size).toBe(2);
    expect(await cache.get('a', async () => 7000)).toBe(7000);
  });

  it('ttl 0 turns the cache off', async () => {
    const { cache } = setup({ ttlMs: 0 });
    const count = jest.fn().mockResolvedValue(50_000);
    await cache.get('all', count);
    await cache.get('all', count);
    expect(count).toHaveBeenCalledTimes(2);
  });
});
