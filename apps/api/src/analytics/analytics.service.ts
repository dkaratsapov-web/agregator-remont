import {
  ANALYTICS_METRICS,
  USAGE_COUNTERS,
  type AnalyticsDto,
  type AnalyticsMetric,
  type AnalyticsPeriod,
} from '@agregator/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MSK_OFFSET_MS, mskDay } from './usage';

const DAY_MS = 86_400_000;
/** День записи по Москве (created_at хранится в UTC без пояса). */
const LOCAL_DAY = Prisma.raw(`(created_at + interval '3 hours')::date::text`);

interface Row {
  day: string;
  key: string;
  n: number;
}

/** Что из журнала действий считается шагом воронки. */
const AUDIT_METRICS: Record<string, AnalyticsMetric> = {
  JOB_CREATED: 'JOBS_PUBLISHED',
  BID_CREATED: 'BIDS_PLACED',
  BID_ACCEPTED: 'CONTRACTORS_CHOSEN',
  REVIEW_CREATED: 'REVIEWS_LEFT',
  CONTACTS_SHARED: 'CONTACTS_SHARED',
  JOB_COMPLETED: 'JOBS_COMPLETED',
};
const COUNTER_METRICS: readonly AnalyticsMetric[] = USAGE_COUNTERS;
const ROLE_METRICS: Record<string, AnalyticsMetric> = {
  CUSTOMER: 'CUSTOMERS_REGISTERED',
  CONTRACTOR: 'CONTRACTORS_REGISTERED',
};

/**
 * Воронка по дням за период: только числа. Считается по уже записанным данным (регистрации,
 * журнал действий, сообщения) и счётчикам usage_counters; дни — по Москве.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(period: AnalyticsPeriod, now = new Date()): Promise<AnalyticsDto> {
    const today = mskDay(now);
    const todayUtc = Date.parse(`${today}T00:00:00Z`);
    const days = Array.from({ length: period }, (_, i) =>
      new Date(todayUtc - (period - 1 - i) * DAY_MS).toISOString().slice(0, 10),
    );
    // Начало первого дня по Москве в UTC (так хранится created_at).
    const since = new Date(Date.parse(`${days[0]}T00:00:00Z`) - MSK_OFFSET_MS).toISOString();
    const [users, audit, messages, counters] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT ${LOCAL_DAY} AS day, role::text AS key, count(*)::int AS n FROM users
        WHERE created_at >= ${since}::timestamp GROUP BY 1, 2`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT ${LOCAL_DAY} AS day,
               CASE WHEN action = 'JOB_CLOSED' THEN 'JOB_COMPLETED' ELSE action::text END AS key,
               count(*)::int AS n
        FROM audit_logs
        WHERE created_at >= ${since}::timestamp
          AND (action IN ('JOB_CREATED', 'BID_CREATED', 'BID_ACCEPTED', 'REVIEW_CREATED',
                          'CONTACTS_SHARED')
               OR (action = 'JOB_CLOSED' AND changes -> 'closeOutcome' ->> 'to' = 'COMPLETED'))
        GROUP BY 1, 2`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT ${LOCAL_DAY} AS day, 'MESSAGES_SENT' AS key, count(*)::int AS n FROM job_messages
        WHERE created_at >= ${since}::timestamp GROUP BY 1`),
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT day::text AS day, metric AS key, count AS n FROM usage_counters
        WHERE day >= ${days[0]}::date`),
    ]);

    const index = new Map(days.map((day, i) => [day, i]));
    const perDay = new Map<AnalyticsMetric, number[]>(
      ANALYTICS_METRICS.map((metric) => [metric, days.map(() => 0)]),
    );
    const add = (rows: Row[], map: (key: string) => AnalyticsMetric | undefined) => {
      for (const row of rows) {
        const metric = map(row.key);
        const i = index.get(row.day);
        if (metric && i !== undefined) perDay.get(metric)![i] += Number(row.n);
      }
    };
    add(users, (key) => ROLE_METRICS[key]);
    add(audit, (key) => AUDIT_METRICS[key]);
    add(messages, () => 'MESSAGES_SENT');
    add(counters, (key) => COUNTER_METRICS.find((metric) => metric === key));
    return {
      days,
      series: ANALYTICS_METRICS.map((metric) => {
        const values = perDay.get(metric)!;
        return { metric, total: values.reduce((a, b) => a + b, 0), perDay: values };
      }),
    };
  }
}
