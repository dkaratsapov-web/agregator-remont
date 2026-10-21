import {
  CONTENT_FLAG_LABELS,
  REPORT_FILTERS,
  REPORT_LIMITS,
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  type ContentFlagDto,
  type Paginated,
  type ReportDto,
  type ReportFilter,
} from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FlagResolveForm } from '@/components/admin/flag-resolve-form';
import { ModerationForm } from '@/components/admin/moderation-form';
import { ApiUnavailable } from '@/components/api-unavailable';
import { listFlags, listReports } from '@/lib/api';
import { requireAdminPage } from '@/lib/customer';
import { formatDateTime } from '@/lib/format';
import { parsePage } from '@/lib/search-params';
import {
  resolveFlagFormAction,
  resolveReportFormAction,
  setBlockedFormAction,
  setHiddenFormAction,
} from './actions';

export const metadata: Metadata = { title: 'Жалобы', robots: { index: false } };

const FILTER_LABELS: Record<ReportFilter, string> = {
  OPEN: 'Ждут разбора',
  RESOLVED: 'Меры приняты',
  DISMISSED: 'Нарушения нет',
  ALL: 'Все',
};

const KIND = { JOB: 'jobs', MESSAGE: 'messages', BID: 'bids' } as const;
const HIDE_LABEL = { JOB: 'заказ', MESSAGE: 'сообщение', BID: 'отклик' } as const;
const HIDDEN_TEXT = {
  JOB: 'Заказ скрыт',
  MESSAGE: 'Сообщение скрыто',
  BID: 'Отклик скрыт',
} as const;

type View = 'reports' | 'flags';

function href(status: ReportFilter, page = 1, view: View = 'reports'): string {
  const query = new URLSearchParams({ status });
  if (view === 'flags') query.set('view', 'flags');
  if (page > 1) query.set('page', String(page));
  return `/admin/reports?${query.toString()}`;
}

function FlagCard({ flag, returnTo }: { flag: ContentFlagDto; returnTo: string }) {
  const open = flag.status === 'OPEN';
  const noun = flag.targetType === 'MESSAGE' ? 'сообщение' : 'отклик';
  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold text-ink">
          {flag.targetType === 'MESSAGE' ? 'Сообщение' : 'Отклик'}: похоже на контакты (
          {flag.kinds.map((kind) => CONTENT_FLAG_LABELS[kind]).join(', ')})
        </p>
        <p className="text-sm text-ink-soft">
          <span
            className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              open ? 'bg-accent-tint text-accent-hover' : 'bg-sunken text-ink-soft'
            }`}
          >
            {REPORT_STATUS_LABELS[flag.status]}
          </span>
          <time dateTime={flag.createdAt} className="tabular-nums">
            {formatDateTime(flag.createdAt)}
          </time>
        </p>
      </div>
      <div className="mt-3 rounded-[12px] border border-line bg-canvas p-4">
        <p className="text-xs text-ink-soft">
          Заказ: <span className="font-medium text-ink">{flag.jobTitle}</span>
        </p>
        <p className="mt-1.5 whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">
          {flag.excerpt || 'Нет текста'}
        </p>
        {flag.hidden ? (
          <p className="mt-1.5 text-xs font-semibold text-ink-soft">Скрыто модератором</p>
        ) : null}
        <p className="mt-1.5 text-sm text-ink-soft">
          Автор: {flag.author.name}, ID <span className="tabular-nums">{flag.author.publicId}</span>
          {flag.author.blocked ? (
            <span className="ml-2 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent-hover">
              Заблокирован
            </span>
          ) : null}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <ModerationForm
          action={setHiddenFormAction}
          args={[
            flag.targetType === 'MESSAGE' ? 'messages' : 'bids',
            flag.targetId,
            !flag.hidden,
            returnTo,
          ]}
          summary={flag.hidden ? `Вернуть ${noun}` : `Скрыть ${noun}`}
          label="Причина (попадёт в журнал)"
          buttons={[
            {
              label: flag.hidden ? `Вернуть ${noun}` : `Скрыть ${noun}`,
              tone: flag.hidden ? 'plain' : 'danger',
            },
          ]}
          tone={flag.hidden ? 'plain' : 'danger'}
        />
        <ModerationForm
          action={setBlockedFormAction}
          args={[flag.author.id, !flag.author.blocked, returnTo]}
          summary={flag.author.blocked ? 'Разблокировать автора' : 'Заблокировать автора'}
          label="Причина (попадёт в журнал)"
          buttons={[
            {
              label: flag.author.blocked ? 'Разблокировать' : 'Заблокировать',
              tone: flag.author.blocked ? 'plain' : 'danger',
            },
          ]}
          tone={flag.author.blocked ? 'plain' : 'danger'}
        />
        {open ? (
          <FlagResolveForm action={resolveFlagFormAction} args={[flag.id, returnTo]} />
        ) : null}
      </div>
    </li>
  );
}

function parseFilter(raw: string | string[] | undefined): ReportFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return REPORT_FILTERS.includes(value as ReportFilter) ? (value as ReportFilter) : 'OPEN';
}

function ReportCard({ report, returnTo }: { report: ReportDto; returnTo: string }) {
  const { subject } = report;
  const open = report.status === 'OPEN';
  const noun = HIDE_LABEL[report.targetType];
  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold text-ink">
          {REPORT_TARGET_LABELS[report.targetType]}: {REPORT_REASON_LABELS[report.reason]}
        </p>
        <p className="text-sm text-ink-soft">
          <span
            className={`mr-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              open ? 'bg-accent-tint text-accent-hover' : 'bg-sunken text-ink-soft'
            }`}
          >
            {REPORT_STATUS_LABELS[report.status]}
          </span>
          <time dateTime={report.createdAt} className="tabular-nums">
            {formatDateTime(report.createdAt)}
          </time>
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Пожаловался: {report.reporter.name}, ID{' '}
        <span className="tabular-nums">{report.reporter.publicId}</span>
      </p>
      {report.comment ? (
        <p className="mt-2 whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">
          «{report.comment}»
        </p>
      ) : null}

      <div className="mt-3 rounded-[12px] border border-line bg-canvas p-4">
        <p className="text-xs text-ink-soft">
          Заказ: <span className="font-medium text-ink">{subject.jobTitle || 'удалён'}</span>
        </p>
        {report.targetType !== 'JOB' ? (
          <p className="mt-1.5 whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">
            {subject.excerpt || 'Нет текста'}
          </p>
        ) : null}
        {subject.hidden ? (
          <p className="mt-1.5 text-xs font-semibold text-ink-soft">
            {HIDDEN_TEXT[report.targetType]}
          </p>
        ) : null}
        {subject.author ? (
          <p className="mt-1.5 text-sm text-ink-soft">
            Автор: {subject.author.name}, ID{' '}
            <span className="tabular-nums">{subject.author.publicId}</span>
            {subject.author.blocked ? (
              <span className="ml-2 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent-hover">
                Заблокирован
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {report.note ? (
        <p className="mt-2 text-sm text-ink-soft">
          Решение: <span className="text-ink">{report.note}</span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-start gap-2">
        {subject.jobTitle ? (
          <ModerationForm
            action={setHiddenFormAction}
            args={[KIND[report.targetType], report.targetId, !subject.hidden, returnTo]}
            summary={subject.hidden ? `Вернуть ${noun}` : `Скрыть ${noun}`}
            label="Причина (попадёт в журнал)"
            buttons={[
              {
                label: subject.hidden ? `Вернуть ${noun}` : `Скрыть ${noun}`,
                tone: subject.hidden ? 'plain' : 'danger',
              },
            ]}
            tone={subject.hidden ? 'plain' : 'danger'}
          />
        ) : null}
        {subject.author ? (
          <ModerationForm
            action={setBlockedFormAction}
            args={[subject.author.id, !subject.author.blocked, returnTo]}
            summary={subject.author.blocked ? 'Разблокировать автора' : 'Заблокировать автора'}
            label="Причина (попадёт в журнал)"
            buttons={[
              {
                label: subject.author.blocked ? 'Разблокировать' : 'Заблокировать',
                tone: subject.author.blocked ? 'plain' : 'danger',
              },
            ]}
            tone={subject.author.blocked ? 'plain' : 'danger'}
          />
        ) : null}
        {open ? (
          <ModerationForm
            action={resolveReportFormAction}
            args={[report.id, returnTo]}
            summary="Закрыть жалобу"
            label="Решение (увидят другие администраторы)"
            buttons={[
              { label: 'Меры приняты', value: 'RESOLVED' },
              { label: 'Нарушения нет', value: 'DISMISSED' },
            ]}
          />
        ) : null}
      </div>
    </li>
  );
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([requireAdminPage('/admin/reports'), searchParams]);
  if (!token) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-14 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Жалобы</h1>
        <p className="mt-4 text-ink-soft">Раздел доступен только администратору.</p>
      </div>
    );
  }
  const status = parseFilter(query.status);
  const page = parsePage(query.page);
  const view: View =
    (Array.isArray(query.view) ? query.view[0] : query.view) === 'flags' ? 'flags' : 'reports';
  const current = href(status, page, view);

  let data: Paginated<ReportDto> | Paginated<ContentFlagDto> | null = null;
  try {
    data =
      view === 'flags'
        ? await listFlags(token, status, page)
        : await listReports(token, status, page);
  } catch (error) {
    console.error('Admin reports: failed to load', error);
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / REPORT_LIMITS.PAGE)) : 1;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Администратор</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-[2.6rem]">Жалобы</h1>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        Жалобы на заказы, сообщения и отклики и автопроверка: контакты в тексте. Скрытое не видно в
        каталоге и сторонам сделки, заблокированный не может войти. Каждое действие с причиной
        пишется в журнал.
      </p>

      <nav aria-label="Раздел" className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-b border-line">
        {(
          [
            ['reports', 'Жалобы людей'],
            ['flags', 'Автопроверка: контакты в тексте'],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={href('OPEN', 1, key)}
            aria-current={key === view ? 'page' : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 text-sm font-semibold ${
              key === view
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <nav aria-label="Фильтр" className="mt-5 flex flex-wrap gap-2">
        {REPORT_FILTERS.map((filter) => {
          const active = filter === status;
          return (
            <Link
              key={filter}
              href={href(filter, 1, view)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-150 ${
                active
                  ? 'bg-ink text-canvas'
                  : 'bg-surface text-ink ring-1 ring-line hover:ring-ink/25'
              }`}
            >
              {FILTER_LABELS[filter]}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        {data === null ? (
          <ApiUnavailable />
        ) : data.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center text-ink-soft">
            {view === 'flags'
              ? status === 'OPEN'
                ? 'Новых пометок нет.'
                : 'Пометок нет.'
              : status === 'OPEN'
                ? 'Новых жалоб нет.'
                : 'Жалоб нет.'}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {view === 'flags'
              ? (data.items as ContentFlagDto[]).map((flag) => (
                  <FlagCard key={flag.id} flag={flag} returnTo={current} />
                ))
              : (data.items as ReportDto[]).map((report) => (
                  <ReportCard key={report.id} report={report} returnTo={current} />
                ))}
          </ul>
        )}
      </div>

      {data && totalPages > 1 ? (
        <nav
          aria-label="Страницы"
          className="mt-6 flex items-center justify-between text-sm font-semibold"
        >
          {page > 1 ? <Link href={href(status, page - 1, view)}>Назад</Link> : <span />}
          <span className="font-normal tabular-nums text-ink-soft">
            Страница {page} из {totalPages}
          </span>
          {page < totalPages ? <Link href={href(status, page + 1, view)}>Вперёд</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
