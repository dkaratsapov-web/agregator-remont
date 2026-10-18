import type { LeadDto, Paginated } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LeadToggle } from '@/components/admin/lead-toggle';
import { ApiUnavailable } from '@/components/api-unavailable';
import { listLeads, type LeadFilter } from '@/lib/api';
import { requireAdminPage } from '@/lib/customer';
import { parsePage } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Заявки', robots: { index: false } };

const PAGE_SIZE = 20;

const FILTERS: { value: LeadFilter | undefined; label: string }[] = [
  { value: 'new', label: 'Новые' },
  { value: 'processed', label: 'Обработанные' },
  { value: undefined, label: 'Все' },
];

const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
});

/** +79001234567 → +7 900 123-45-67 */
const formatPhone = (phone: string) =>
  phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 $1 $2-$3-$4');

function href(status: LeadFilter | undefined, page = 1): string {
  const query = new URLSearchParams();
  query.set('status', status ?? 'all');
  if (page > 1) query.set('page', String(page));
  return `/admin/leads?${query.toString()}`;
}

function parseFilter(raw: string | string[] | undefined): LeadFilter | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'all') return undefined;
  return value === 'processed' ? 'processed' : 'new';
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([requireAdminPage('/admin/leads'), searchParams]);
  if (!token) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-14 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Заявки</h1>
        <p className="mt-4 text-ink-soft">Раздел доступен только администратору.</p>
      </div>
    );
  }
  const status = parseFilter(query.status);
  const page = parsePage(query.page);
  const current = href(status, page);

  let data: Paginated<LeadDto> | null = null;
  try {
    data = await listLeads(token, page, status);
  } catch (error) {
    console.error('Admin leads: failed to load', error);
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Администратор</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-[2.6rem]">
        Заявки на тестирование
      </h1>

      <nav aria-label="Фильтр заявок" className="mt-8 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = filter.value === status;
          return (
            <Link
              key={filter.label}
              href={href(filter.value)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-150 ${
                active
                  ? 'bg-ink text-canvas'
                  : 'bg-surface text-ink ring-1 ring-line hover:ring-ink/25'
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        {data === null ? (
          <ApiUnavailable />
        ) : data.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center text-ink-soft">
            {status === 'new' ? 'Новых заявок нет.' : 'Заявок пока нет.'}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {data.items.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{lead.name}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    <a
                      href={`tel:${lead.phone}`}
                      className="font-medium text-ink tabular-nums underline-offset-4 hover:underline"
                    >
                      {formatPhone(lead.phone)}
                    </a>
                    <span aria-hidden="true"> · </span>
                    <time dateTime={lead.createdAt}>
                      {timeFormat.format(new Date(lead.createdAt))}
                    </time>
                  </p>
                </div>
                {lead.processedAt ? (
                  <span className="rounded-full bg-ok-tint px-2.5 py-1 text-xs font-semibold text-ok">
                    Обработана
                  </span>
                ) : (
                  <span className="rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-hover">
                    Новая
                  </span>
                )}
                <LeadToggle id={lead.id} processed={lead.processedAt !== null} returnTo={current} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && totalPages > 1 ? (
        <nav
          aria-label="Страницы заявок"
          className="mt-8 flex items-center justify-between text-sm"
        >
          {page > 1 ? (
            <Link
              href={href(status, page - 1)}
              className="font-semibold hover:underline"
              rel="prev"
            >
              Назад
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-soft tabular-nums">
            {page} из {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={href(status, page + 1)}
              className="font-semibold hover:underline"
              rel="next"
            >
              Вперёд
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
