import {
  PRICE_ESTIMATE,
  findServiceCity,
  roundEstimate,
  type JobCategory,
  type PriceEstimateDto,
  type PriceEstimatesDto,
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

/**
 * Оценка цены по откликам сервиса (docs/PRICE_ESTIMATES.md). Учитываются отклики не старше
 * окна: не отозванные, не скрытые модератором, от незаблокированных мастеров, к нескрытым
 * заказам из одной категории (цена заказа из нескольких работ не относится к одной категории).
 * Категория попадает в ответ, только если откликов, заказов и мастеров достаточно; суммы
 * округлены. Сначала по городу, при нехватке данных — по всем городам.
 */
@Injectable()
export class PriceEstimatesService {
  constructor(private readonly prisma: PrismaService) {}

  async estimates(cityQuery?: string, now = new Date()): Promise<PriceEstimatesDto> {
    const city = cityQuery ? (findServiceCity(cityQuery)?.name ?? null) : null;
    const since = new Date(now.getTime() - PRICE_ESTIMATE.WINDOW_DAYS * 86_400_000);
    const [local, all] = await Promise.all([
      city ? this.query(since, Prisma.sql`AND j.city = ${city}`) : Promise.resolve([]),
      this.query(since, Prisma.empty),
    ]);
    const byCategory = new Map<JobCategory, PriceEstimateDto>();
    for (const row of all) byCategory.set(row.category, this.dto(row, null));
    for (const row of local) byCategory.set(row.category, this.dto(row, city));
    return { items: [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category)) };
  }

  private dto(row: Row, city: string | null): PriceEstimateDto {
    return {
      category: row.category,
      city,
      low: roundEstimate(row.low),
      median: roundEstimate(row.median),
      high: roundEstimate(row.high),
      bids: row.bids,
    };
  }

  private query(since: Date, where: Prisma.Sql): Promise<Row[]> {
    return this.prisma.$queryRaw<Row[]>`
      SELECT j.category::text AS category,
             percentile_cont(0.25) WITHIN GROUP (ORDER BY b.price)::float8 AS low,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY b.price)::float8 AS median,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY b.price)::float8 AS high,
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
      GROUP BY j.category
      HAVING count(*) >= ${PRICE_ESTIMATE.MIN_BIDS}
         AND count(DISTINCT b.job_id) >= ${PRICE_ESTIMATE.MIN_JOBS}
         AND count(DISTINCT b.contractor_id) >= ${PRICE_ESTIMATE.MIN_CONTRACTORS}`;
  }
}
