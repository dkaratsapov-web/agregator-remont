import type { PriceEstimatesDto } from '@agregator/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { PriceEstimatesService } from './price-estimates.service';

/** Промис, который тест завершает сам. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const result = (bids: number): PriceEstimatesDto => ({
  items: [
    {
      category: 'TILING',
      city: null,
      low: 1,
      median: 2,
      high: 3,
      bids,
      rough: true,
      perSqm: null,
    },
  ],
});

describe('PriceEstimatesService cache (audit F-03)', () => {
  let now = 0;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    process.env.PRICE_ESTIMATES_CACHE_SEC = '60';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.PRICE_ESTIMATES_CACHE_SEC;
  });

  it('a late failure of an old calculation does not evict a newer cached result', async () => {
    const service = new PriceEstimatesService({} as PrismaService);
    const first = deferred<PriceEstimatesDto>();
    const second = deferred<PriceEstimatesDto>();
    const compute = jest
      .spyOn(service, 'compute')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const a = service.estimates();
    // Первый расчёт висит дольше срока кэша: следующий запрос начинает новый.
    now += 61_000;
    const b = service.estimates();
    second.resolve(result(2));
    await expect(b).resolves.toEqual(result(2));
    // Теперь первый падает — свежий результат должен остаться в кэше.
    first.reject(new Error('timeout'));
    await expect(a).rejects.toThrow('timeout');
    await Promise.resolve();

    await expect(service.estimates()).resolves.toEqual(result(2));
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('a failure removes its own entry: the next request recalculates', async () => {
    const service = new PriceEstimatesService({} as PrismaService);
    const compute = jest
      .spyOn(service, 'compute')
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(result(5));
    await expect(service.estimates()).rejects.toThrow('db down');
    await Promise.resolve();
    await expect(service.estimates()).resolves.toEqual(result(5));
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('concurrent requests share one calculation; another city has its own', async () => {
    const service = new PriceEstimatesService({} as PrismaService);
    const compute = jest.spyOn(service, 'compute').mockResolvedValue(result(1));
    await Promise.all([service.estimates(), service.estimates(), service.estimates('Москва')]);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
