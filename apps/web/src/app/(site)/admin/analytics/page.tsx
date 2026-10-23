import {
  ANALYTICS_METRIC_LABELS,
  ANALYTICS_PERIODS,
  type AnalyticsDto,
  type AnalyticsMetric,
  type AnalyticsPeriod,
} from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DayBars, formatDay } from '@/components/admin/day-bars';
import { ApiUnavailable } from '@/components/api-unavailable';
import { getAnalytics } from '@/lib/api';
import { requireAdminPage } from '@/lib/customer';

export const metadata: Metadata = { title: 'Аналитика', robots: { index: false } };

const GROUPS: { title: string; metrics: AnalyticsMetric[] }[] = [
  { title: 'Люди', metrics: ['CUSTOMERS_REGISTERED', 'CONTRACTORS_REGISTERED'] },
  {
    title: 'Заказы',
    metrics: ['CATALOG_VIEWS', 'JOB_VIEWS', 'DRAFTS_STARTED', 'JOBS_PUBLISHED'],
  },
  {
    title: 'Сделки',
    metrics: [
      'BIDS_PLACED',
      'CONTRACTORS_CHOSEN',
      'MESSAGES_SENT',
      'CONTACTS_SHARED',
      'JOBS_COMPLETED',
      'REVIEWS_LEFT',
    ],
  },
];

function parsePeriod(raw: string | string[] | undefined): AnalyticsPeriod {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return ANALYTICS_PERIODS.find((p) => p === value) ?? 30;
}

function MetricRow({ report, metric }: { report: AnalyticsDto; metric: AnalyticsMetric }) {
  const series = report.series.find((s) => s.metric === metric);
  if (!series) return null;
  const label = ANALYTICS_METRIC_LABELS[metric];
  return (
    <li className="grid items-center gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:px-6">
      <div className="flex items-baseline justify-between gap-3 sm:block">
        <p className="text-sm text-ink-soft">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-ink">{series.total}</p>
      </div>
      <DayBars label={label} days={report.days} values={series.perDay} />
    </li>
  );
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([
    requireAdminPage('/admin/analytics'),
    searchParams,
  ]);
  if (!token) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-14 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Аналитика</h1>
        <p className="mt-4 text-ink-soft">Раздел доступен только администратору.</p>
      </div>
    );
  }
  const period = parsePeriod(query.days);
  let report: AnalyticsDto | null = null;
  try {
    report = await getAnalytics(token, period);
  } catch (error) {
    console.error('Admin analytics: failed to load', error);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Администратор</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-[2.6rem]">Аналитика</h1>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        Сколько раз за день прошли каждый шаг: только числа по дням (Москва), без людей, адресов и
        cookie. Просмотры — открытия страниц, включая повторные и поисковых роботов; их и начатые
        черновики сервис считает с этой версии.
      </p>

      <nav aria-label="Период" className="mt-8 flex flex-wrap gap-2">
        {ANALYTICS_PERIODS.map((days) => (
          <Link
            key={days}
            href={`/admin/analytics?days=${days}`}
            aria-current={days === period ? 'page' : undefined}
            className="inline-flex min-h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink hover:border-ink/30 aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-canvas"
          >
            {days} дней
          </Link>
        ))}
      </nav>

      {report === null ? (
        <div className="mt-6">
          <ApiUnavailable />
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink-soft">
            С {formatDay(report.days[0])} по {formatDay(report.days.at(-1)!)} включительно.
          </p>
          {GROUPS.map((group) => (
            <section key={group.title} aria-labelledby={`group-${group.title}`} className="mt-8">
              <h2 id={`group-${group.title}`} className="text-lg font-semibold text-ink">
                {group.title}
              </h2>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
                {group.metrics.map((metric) => (
                  <MetricRow key={metric} report={report} metric={metric} />
                ))}
              </ul>
            </section>
          ))}

          <details className="mt-10 rounded-2xl border border-line bg-surface">
            <summary className="cursor-pointer px-5 py-4 font-semibold text-ink sm:px-6">
              Таблица по дням
            </summary>
            <div className="overflow-x-auto border-t border-line">
              <table className="min-w-full text-sm tabular-nums">
                <caption className="sr-only">Шаги воронки по дням</caption>
                <thead>
                  <tr className="text-left text-ink-soft">
                    <th scope="col" className="px-3 py-2 font-medium">
                      День
                    </th>
                    {report.series.map((s) => (
                      <th key={s.metric} scope="col" className="px-3 py-2 font-medium">
                        {ANALYTICS_METRIC_LABELS[s.metric]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.days
                    .map((day, i) => ({ day, i }))
                    .reverse()
                    .map(({ day, i }) => (
                      <tr key={day}>
                        <th
                          scope="row"
                          className="whitespace-nowrap px-3 py-2 text-left font-medium"
                        >
                          {formatDay(day)}
                        </th>
                        {report.series.map((s) => (
                          <td key={s.metric} className="px-3 py-2 text-ink">
                            {s.perDay[i]}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
