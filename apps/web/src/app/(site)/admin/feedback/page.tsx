import {
  FEEDBACK_KIND_LABELS,
  USER_ROLE_LABELS,
  type AdminFeedbackDto,
  type Paginated,
} from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { FeedbackReply } from '@/components/feedback/feedback-reply';
import { listFeedback, type FeedbackFilter } from '@/lib/api';
import { requireAdminPage } from '@/lib/customer';
import { formatDateTime } from '@/lib/format';
import { parsePage } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Обращения', robots: { index: false } };

const PAGE_SIZE = 20;

const FILTERS: { value: FeedbackFilter | undefined; label: string }[] = [
  { value: 'open', label: 'Без ответа' },
  { value: 'answered', label: 'С ответом' },
  { value: undefined, label: 'Все' },
];

function href(status: FeedbackFilter | undefined, page = 1): string {
  const query = new URLSearchParams();
  query.set('status', status ?? 'all');
  if (page > 1) query.set('page', String(page));
  return `/admin/feedback?${query.toString()}`;
}

function parseFilter(raw: string | string[] | undefined): FeedbackFilter | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'all') return undefined;
  return value === 'answered' ? 'answered' : 'open';
}

function Item({ item, returnTo }: { item: AdminFeedbackDto; returnTo: string }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold text-ink">
          {FEEDBACK_KIND_LABELS[item.kind]} · {item.author.name}{' '}
          <span className="font-normal text-ink-soft">
            ({USER_ROLE_LABELS[item.author.role]}, ID {item.author.publicId})
          </span>
        </p>
        <time dateTime={item.createdAt} className="text-sm tabular-nums text-ink-soft">
          {formatDateTime(item.createdAt)}
        </time>
      </div>
      {item.page ? <p className="mt-0.5 text-sm text-ink-soft">Страница {item.page}</p> : null}
      <p className="mt-2 whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">
        {item.body}
      </p>
      {item.reply ? (
        <div className="mt-3 rounded-xl bg-ok-tint px-4 py-3">
          <p className="text-xs font-semibold text-ok">
            Ответ от {item.repliedAt ? formatDateTime(item.repliedAt) : ''}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">
            {item.reply}
          </p>
        </div>
      ) : (
        <FeedbackReply id={item.id} returnTo={returnTo} />
      )}
    </li>
  );
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([requireAdminPage('/admin/feedback'), searchParams]);
  if (!token) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-14 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Обращения</h1>
        <p className="mt-4 text-ink-soft">Раздел доступен только администратору.</p>
      </div>
    );
  }
  const status = parseFilter(query.status);
  const page = parsePage(query.page);
  const current = href(status, page);

  let data: Paginated<AdminFeedbackDto> | null = null;
  try {
    data = await listFeedback(token, page, status);
  } catch (error) {
    console.error('Admin feedback: failed to load', error);
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Администратор</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-[2.6rem]">
        Обращения тестировщиков
      </h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Ошибки, идеи и вопросы из раздела «Поддержка». Без ответа — сначала старые. Человек увидит
        ответ в «Моих обращениях».
      </p>

      <nav aria-label="Фильтр обращений" className="mt-8 flex flex-wrap gap-2">
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
            {status === 'open' ? 'Все обращения отвечены.' : 'Обращений пока нет.'}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {data.items.map((item) => (
              <Item key={item.id} item={item} returnTo={current} />
            ))}
          </ul>
        )}
      </div>

      {data && totalPages > 1 ? (
        <nav
          aria-label="Страницы обращений"
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
