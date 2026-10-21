import { FAVORITE_LIMITS, type JobDto, type Paginated } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { JobCard } from '@/components/job-card';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { listFavorites } from '@/lib/api';
import { requireUserPage } from '@/lib/customer';
import { parsePage } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Избранное', robots: { index: false } };

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([
    requireUserPage('/account/favorites'),
    searchParams,
  ]);
  const page = parsePage(query.page);
  let data: Paginated<JobDto> | null = null;
  try {
    data = await listFavorites(token, page);
  } catch (error) {
    console.error('Favorites: failed to load', error);
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / FAVORITE_LIMITS.PAGE)) : 1;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title="Избранное"
        description={`Заказы, к которым вы хотите вернуться. Добавить — кнопкой «В избранное» на странице заказа, до ${FAVORITE_LIMITS.MAX} заказов. Скрытые модератором заказы отсюда пропадают.`}
      />
      <div className="mt-8">
        {data === null ? (
          <ApiUnavailable />
        ) : data.items.length === 0 ? (
          <div className="max-w-3xl rounded-2xl border border-line bg-surface">
            <EmptyState title="В избранном пусто">
              Откройте заказ в{' '}
              <Link href="/jobs" className="font-semibold text-accent hover:underline">
                каталоге
              </Link>{' '}
              и нажмите «В избранное».
            </EmptyState>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {data && totalPages > 1 ? (
        <nav
          aria-label="Страницы"
          className="mt-6 flex max-w-3xl items-center justify-between text-sm font-semibold"
        >
          {page > 1 ? <Link href={`/account/favorites?page=${page - 1}`}>Назад</Link> : <span />}
          <span className="font-normal tabular-nums text-ink-soft">
            {page} из {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/account/favorites?page=${page + 1}`}>Вперёд</Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
