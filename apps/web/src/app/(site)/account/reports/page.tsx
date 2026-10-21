import {
  REPORT_LIMITS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  type MyReportDto,
  type Paginated,
} from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ReportsSeen } from '@/components/moderation/reports-seen';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { Sheet, SheetHeader } from '@/components/ui/sheet';
import { listMyReports } from '@/lib/api';
import { requireUserPage } from '@/lib/customer';
import { formatDateTime } from '@/lib/format';
import { parsePage } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Мои жалобы', robots: { index: false } };

function ReportItem({ report }: { report: MyReportDto }) {
  const open = report.status === 'OPEN';
  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold text-ink">
          {REPORT_TARGET_LABELS[report.targetType]}: {REPORT_REASON_LABELS[report.reason]}
          {report.unseen ? (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-xs font-semibold text-accent-ink">
              Новое решение
            </span>
          ) : null}
        </p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            open ? 'bg-sunken text-ink-soft' : 'bg-ok-tint text-ok'
          }`}
        >
          {REPORT_STATUS_LABELS[report.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft [overflow-wrap:anywhere]">
        Заказ «{report.jobTitle}», отправлена{' '}
        <time dateTime={report.createdAt} className="tabular-nums">
          {formatDateTime(report.createdAt)}
        </time>
      </p>
      {report.note ? (
        <p className="mt-2 text-sm text-ink [overflow-wrap:anywhere]">
          Решение администратора: {report.note}
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">
          Администратор ещё не разобрал жалобу. Решение появится здесь.
        </p>
      )}
    </li>
  );
}

export default async function MyReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([requireUserPage('/account/reports'), searchParams]);
  const page = parsePage(query.page);
  let data: Paginated<MyReportDto> | null = null;
  try {
    data = await listMyReports(token, page);
  } catch (error) {
    console.error('My reports: failed to load', error);
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / REPORT_LIMITS.PAGE)) : 1;
  const unseen = data?.items.filter((r) => r.unseen).length ?? 0;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <ReportsSeen unseen={unseen} />
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title="Мои жалобы"
        description="Жалобы, которые вы отправили, и решения администратора по ним. Заблокированный аккаунт и скрытое содержимое больше не видны другим."
      />
      <div className="mt-8 max-w-3xl">
        {data === null ? (
          <ApiUnavailable />
        ) : (
          <Sheet labelledBy="reports-title">
            <SheetHeader id="reports-title" title="Отправленные жалобы" />
            {data.items.length === 0 ? (
              <EmptyState title="Жалоб нет">
                Пожаловаться можно на заказ в каталоге, сообщение в переписке и отклик к вашему
                заказу: кнопка «Пожаловаться» рядом с ними.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {data.items.map((report) => (
                  <ReportItem key={report.id} report={report} />
                ))}
              </ul>
            )}
            {totalPages > 1 ? (
              <nav
                aria-label="Страницы"
                className="flex items-center justify-between border-t border-line px-5 py-2.5 text-sm font-semibold sm:px-6"
              >
                {page > 1 ? (
                  <Link href={`/account/reports?page=${page - 1}`}>Назад</Link>
                ) : (
                  <span />
                )}
                <span className="font-normal tabular-nums text-ink-soft">
                  {page} из {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={`/account/reports?page=${page + 1}`}>Вперёд</Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </Sheet>
        )}
      </div>
    </div>
  );
}
