import {
  PRICE_AREA_QUESTIONS,
  PRICE_ESTIMATE,
  findServiceCity,
  roundEstimate,
  type JobCategory,
  type PriceEstimateDto,
  type PriceEstimatesDto,
  type PriceRangeDto,
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
  constructor(private readonly prisma: PrismaService) {}

  async estimates(cityQuery?: string, now = new Date()): Promise<PriceEstimatesDto> {
    const city = cityQuery ? (findServiceCity(cityQuery)?.name ?? null) : null;
    const since = new Date(now.getTime() - PRICE_ESTIMATE.WINDOW_DAYS * 86_400_000);
    const inCity = city ? Prisma.sql`AND j.city = ${city}` : null;
    const [local, all, localSqm, allSqm] = await Promise.all([
      inCity ? this.query(since, inCity) : Promise.resolve([]),
      this.query(since, Prisma.empty),
      inCity ? this.query(since, inCity, true) : Promise.resolve([]),
      this.query(since, Prisma.empty, true),
    ]);
    const sqm = (rows: Row[], category: JobCategory): PriceRangeDto | null => {
      const row = rows.find((r) => r.category === category);
      return row ? this.range(row, PRICE_ESTIMATE.SQM_ROUND_TO) : null;
    };
    const byCategory = new Map<JobCategory, PriceEstimateDto>();
    for (const row of all) {
      byCategory.set(row.category, this.dto(row, null, sqm(allSqm, row.category)));
    }
    for (const row of local) {
      byCategory.set(row.category, this.dto(row, city, sqm(localSqm, row.category)));
    }
    return { items: [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category)) };
  }

  private range(row: Row, step: number): PriceRangeDto {
    return {
      low: roundEstimate(row.low, step),
      median: roundEstimate(row.median, step),
      high: roundEstimate(row.high, step),
      bids: row.bids,
    };
  }

  private dto(row: Row, city: string | null, perSqm: PriceRangeDto | null): PriceEstimateDto {
    return { category: row.category, city, ...this.range(row, PRICE_ESTIMATE.ROUND_TO), perSqm };
  }

  /** perSqm — цена отклика, делённая на площадь работ, только у заказов с площадью. */
  private query(since: Date, where: Prisma.Sql, perSqm = false): Promise<Row[]> {
    const value = perSqm ? Prisma.sql`(b.price / (${WORK_AREA}))` : Prisma.sql`b.price`;
    const withArea = perSqm ? Prisma.sql`AND (${WORK_AREA}) > 0` : Prisma.empty;
    return this.prisma.$queryRaw<Row[]>`
      SELECT j.category::text AS category,
             percentile_cont(0.25) WITHIN GROUP (ORDER BY ${value})::float8 AS low,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ${value})::float8 AS median,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY ${value})::float8 AS high,
             count(*)::int AS bids
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
