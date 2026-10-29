import {
  ADMIN_USER_LIMITS,
  USER_ROLE_LABELS,
  type AdminUserDto,
  type Paginated,
} from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ModerationForm } from '@/components/admin/moderation-form';
import { ResetLinkForm } from '@/components/admin/reset-link-form';
import { ApiUnavailable } from '@/components/api-unavailable';
import { listAdminUsers } from '@/lib/api';
import { requireAdminPage } from '@/lib/customer';
import { formatDate } from '@/lib/format';
import { parsePage } from '@/lib/search-params';
import { setBlockedFormAction } from '../reports/actions';
import { issueResetLinkFormAction } from './actions';

export const metadata: Metadata = { title: 'Пользователи', robots: { index: false } };

function href(q: string, page = 1): string {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (page > 1) query.set('page', String(page));
  const s = query.toString();
  return `/admin/users${s ? `?${s}` : ''}`;
}

function UserRow({ user, returnTo }: { user: AdminUserDto; returnTo: string }) {
  return (
    <li className="px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold text-ink [overflow-wrap:anywhere]">
          {user.name}{' '}
          <span className="font-normal text-ink-soft">
            · ID <span className="tabular-nums">{user.publicId}</span>
          </span>
        </p>
        <p className="text-sm text-ink-soft">
          {user.blocked ? (
            <span className="mr-2 rounded-full bg-accent-tint px-2.5 py-0.5 text-xs font-semibold text-accent-hover">
              Заблокирован
            </span>
          ) : null}
          {USER_ROLE_LABELS[user.role]}, с {formatDate(user.createdAt)}
        </p>
      </div>
      <p className="mt-1 text-sm text-ink [overflow-wrap:anywhere]">{user.email}</p>
      <p className="mt-1 text-sm text-ink-soft tabular-nums">
        Заказов: {user.jobs} · Откликов: {user.bids} · Открытых жалоб на него: {user.openReports}
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {/* Администратору ссылку не выдать (API отвечает 409): новый пароль — командой на сервере. */}
        {user.blocked || user.role === 'ADMIN' ? null : (
          <ResetLinkForm action={issueResetLinkFormAction} args={[user.id, returnTo]} />
        )}
        {user.role === 'ADMIN' ? null : (
          <ModerationForm
            action={setBlockedFormAction}
            args={[user.id, !user.blocked, returnTo]}
            summary={user.blocked ? 'Разблокировать' : 'Заблокировать'}
            label="Причина (попадёт в журнал)"
            buttons={[
              {
                label: user.blocked ? 'Разблокировать' : 'Заблокировать',
                tone: user.blocked ? 'plain' : 'danger',
              },
            ]}
            tone={user.blocked ? 'plain' : 'danger'}
          />
        )}
      </div>
    </li>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([requireAdminPage('/admin/users'), searchParams]);
  if (!token) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-14 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Пользователи</h1>
        <p className="mt-4 text-ink-soft">Раздел доступен только администратору.</p>
      </div>
    );
  }
  const raw = Array.isArray(query.q) ? query.q[0] : query.q;
  const q = (raw ?? '').trim().slice(0, ADMIN_USER_LIMITS.QUERY_MAX);
  const page = parsePage(query.page);
  const current = href(q, page);

  let data: Paginated<AdminUserDto> | null = null;
  try {
    data = await listAdminUsers(token, q, page);
  } catch (error) {
    console.error('Admin users: failed to load', error);
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / ADMIN_USER_LIMITS.PAGE)) : 1;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Администратор</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-[2.6rem]">Пользователи</h1>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        Поиск по email, имени или номеру аккаунта. Здесь же — блокировка и ссылка для нового пароля,
        если человек его забыл (почты у сервиса пока нет).
      </p>

      <form action="/admin/users" method="get" role="search" className="mt-8 flex gap-2">
        <label htmlFor="users-q" className="sr-only">
          Email, имя или ID
        </label>
        <input
          id="users-q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={ADMIN_USER_LIMITS.QUERY_MAX}
          placeholder="Email, имя или ID"
          className="block min-h-11 w-full min-w-0 rounded-[10px] border border-line bg-surface px-3.5 text-base text-ink"
        />
        <button
          type="submit"
          className="inline-flex min-h-11 shrink-0 items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-canvas hover:bg-ink/85"
        >
          Найти
        </button>
      </form>

      <div className="mt-6">
        {data === null ? (
          <ApiUnavailable />
        ) : data.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center text-ink-soft">
            {q ? 'Никого не нашли. Проверьте написание или поищите по ID.' : 'Пользователей нет.'}
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-soft tabular-nums">Найдено: {data.total}</p>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {data.items.map((user) => (
                <UserRow key={user.id} user={user} returnTo={current} />
              ))}
            </ul>
          </>
        )}
      </div>

      {data && totalPages > 1 ? (
        <nav
          aria-label="Страницы"
          className="mt-6 flex items-center justify-between text-sm font-semibold"
        >
          {page > 1 ? <Link href={href(q, page - 1)}>Назад</Link> : <span />}
          <span className="font-normal tabular-nums text-ink-soft">
            Страница {page} из {totalPages}
          </span>
          {page < totalPages ? <Link href={href(q, page + 1)}>Вперёд</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
