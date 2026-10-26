import {
  PRICE_AREA_QUESTIONS,
  PRICE_ESTIMATE,
  findServiceCity,
  roundEstimate,
  type JobCategory,
  type PriceEstimateDto,
  type PriceEstimatesDto,
  type PriceRangeDto,
  type PriceSqmDto,
} from '@agregator/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface Row {
  category: JobCategory;
  low: number;
  median: number;
  high: number;
  bids: number;
  jobs: number;
}

/** Число из ответа анкеты; иное (строка, нет ответа) — 0. Ключ — из кода, не от человека. */
const answerNumber = (key: string) =>
  Prisma.sql`CASE WHEN jsonb_typeof(j.details -> ${key}) = 'number'
    THEN (j.details ->> ${key})::numeric ELSE 0 END`;

/** Площадь работ заказа по категории (PRICE_AREA_QUESTIONS); 0 — площади нет. */
const WORK_AREA = Prisma.sql`CASE j.category::text ${Prisma.join(
  Object.entries(PRICE_AREA_QUESTIONS).map(
    ([category, keys]) =>
      Prisma.sql`WHEN ${category} THEN ${Prisma.join((keys ?? []).map(answerNumber), ' + ')}`,
  ),
  ' ',
)} ELSE 0 END`;

/**
 * Оценка цены по откликам сервиса (docs/PRICE_ESTIMATES.md). Учитываются отклики не старше
 * окна: не отозванные, не скрытые модератором, от незаблокированных мастеров, к нескрытым
 * заказам из одной категории (цена заказа из нескольких работ не относится к одной категории).
 * Категория попадает в ответ, только если откликов, заказов и мастеров достаточно; суммы
 * округлены. Сначала по городу, при нехватке данных — по всем городам. Цена за м² — по тем же
 * правилам среди заказов, где в анкете указана площадь работ, в том же городе или по всем.
 */
@Injectable()
export class PriceEstimatesService {
  /**
   * Кэш на PRICE_ESTIMATES_CACHE_SEC секунд (по умолчанию 600; 0 — выключен): форма заказа
   * спрашивает оценку при каждом открытии, а на 100 000 откликов каждый из четырёх запросов
   * идёт около 0,2 с (docs/PRICE_ESTIMATES.md). Ключ — город из списка сервиса или «все
   * города», поэтому размер кэша ограничен списком городов. Одновременные запросы ждут один
   * расчёт; ошибка из кэша убирается — только своя запись, не более свежая.
   */
  private readonly cache = new Map<string, { at: number; value: Promise<PriceEstimatesDto> }>();
  private readonly ttlMs: number;

  constructor(private readonly prisma: PrismaService) {
    const seconds = Number(process.env.PRICE_ESTIMATES_CACHE_SEC ?? 600);
    this.ttlMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }

  estimates(cityQuery?: string): Promise<PriceEstimatesDto> {
    const city = cityQuery ? (findServiceCity(cityQuery)?.name ?? null) : null;
    if (this.ttlMs === 0) return this.compute(city);
    const key = city ?? '';
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;
    const value = this.compute(city);
    this.cache.set(key, { at: Date.now(), value });
    // Удаляем только свою запись: пока этот расчёт шёл, срок мог истечь, и в кэше уже лежит
    // результат следующего (аудит 23.10.2026, F-03).
    value.catch(() => {
      if (this.cache.get(key)?.value === value) this.cache.delete(key);
    });
    return value;
  }

  async compute(city: string | null, now = new Date()): Promise<PriceEstimatesDto> {
    const since = new Date(now.getTime() - PRICE_ESTIMATE.WINDOW_DAYS * 86_400_000);
    const inCity = city ? Prisma.sql`AND j.city = ${city}` : null;
    const [local, all, localSqm, allSqm] = await Promise.all([
      inCity ? this.query(since, inCity) : Promise.resolve([]),
      this.query(since, Prisma.empty),
      inCity ? this.query(since, inCity, true) : Promise.resolve([]),
      this.query(since, Prisma.empty, true),
    ]);
    const sqm = (rows: Row[], category: JobCategory, where: string | null): PriceSqmDto | null => {
      const row = rows.find((r) => r.category === category);
      return row ? { ...this.range(row, PRICE_ESTIMATE.SQM_ROUND_TO), city: where } : null;
    };
    // Цена за м² по городу, иначе по всем городам — независимо от того, где посчитана оценка
    // заказа: в городе может хватать откликов вообще, но не хватать откликов с площадью.
    const perSqm = (category: JobCategory) =>
      sqm(localSqm, category, city) ?? sqm(allSqm, category, null);
    const byCategory = new Map<JobCategory, PriceEstimateDto>();
    for (const row of all) byCategory.set(row.category, this.dto(row, null, perSqm(row.category)));
    for (const row of local)
      byCategory.set(row.category, this.dto(row, city, perSqm(row.category)));
    return { items: [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category)) };
  }

  private range(row: Row, step: number): PriceRangeDto {
    return {
      low: roundEstimate(row.low, step),
      median: roundEstimate(row.median, step),
      high: roundEstimate(row.high, step),
      bids: row.bids,
      rough:
        row.bids < PRICE_ESTIMATE.ROUGH_BELOW_BIDS || row.jobs < PRICE_ESTIMATE.ROUGH_BELOW_JOBS,
    };
  }

  private dto(row: Row, city: string | null, perSqm: PriceSqmDto | null): PriceEstimateDto {
    return { category: row.category, city, ...this.range(row, PRICE_ESTIMATE.ROUND_TO), perSqm };
  }

  /** perSqm — цена отклика, делённая на площадь работ, только у заказов с площадью. */
  private query(since: Date, where: Prisma.Sql, perSqm = false): Promise<Row[]> {
    const value = perSqm ? Prisma.sql`(b.price / (${WORK_AREA}))` : Prisma.sql`b.price`;
    // Мелкие работы (меньше SQM_MIN_AREA м²) в цену за м² не входят: цена за метр там не
    // показательна (аудит F-04).
    const withArea = perSqm
      ? Prisma.sql`AND (${WORK_AREA}) >= ${PRICE_ESTIMATE.SQM_MIN_AREA}`
      : Prisma.empty;
    return this.prisma.$queryRaw<Row[]>`
      SELECT j.category::text AS category,
             percentile_cont(0.25) WITHIN GROUP (ORDER BY ${value})::float8 AS low,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ${value})::float8 AS median,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY ${value})::float8 AS high,
             count(*)::int AS bids,
             count(DISTINCT b.job_id)::int AS jobs
      FROM bids b
      JOIN jobs j ON j.id = b.job_id
      JOIN users u ON u.id = b.contractor_id
      WHERE b.status <> 'WITHDRAWN'
        AND b.hidden_at IS NULL
        AND j.hidden_at IS NULL
        AND u.blocked_at IS NULL
        AND cardinality(j.categories) <= 1
        AND b.created_at >= ${since}
        ${where}
        ${withArea}
      GROUP BY j.category
      HAVING count(*) >= ${PRICE_ESTIMATE.MIN_BIDS}
         AND count(DISTINCT b.job_id) >= ${PRICE_ESTIMATE.MIN_JOBS}
         AND count(DISTINCT b.contractor_id) >= ${PRICE_ESTIMATE.MIN_CONTRACTORS}`;
  }
}
