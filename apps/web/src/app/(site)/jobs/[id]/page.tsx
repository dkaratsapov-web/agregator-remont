import { JOB_CATEGORY_LABELS } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { StatusBadge } from '@/components/status-badge';
import type { MyBidDto, UserDto } from '@agregator/shared';
import { RespondPanel } from '@/components/bids/respond-panel';
import {
  JobHighlights,
  JobPositionsDetails,
  jobCategoryLabels,
} from '@/components/jobs/job-details';
import { getFavoriteIds, getJob, getMyJob, listMyBids } from '@/lib/api';
import { FavoriteButton } from '@/components/jobs/favorite-button';
import { getCurrentUser, getSessionToken } from '@/lib/session';
import { ReportButton } from '@/components/moderation/report-button';
import { Notice } from '@/components/notice';
import { MarkSeen } from '@/components/notifications/mark-seen';
import { getUnreadSummary, unreadForJob } from '@/lib/notifications-server';
import { reportNotice } from '@/lib/search-params';
import { formatBudget, formatDate } from '@/lib/format';
import { jobsHref } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

// Один запрос к API на рендер, даже если данные нужны и метаданным, и странице.
const loadJob = cache(getJob);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const job = await loadJob((await params).id);
  if (!job) return { title: 'Заказ не найден' };
  return { title: job.title, description: job.description.slice(0, 160) };
}

interface Viewer {
  user: UserDto | null;
  /** Заказчик-владелец этого заказа (проверяется API кабинета: чужой заказ даёт 404). */
  own: boolean;
  /** Отклик подрядчика на этот заказ, если есть. */
  myBid: MyBidDto | null;
  /** Заказ в избранном у вошедшего. */
  favorite: boolean;
}

async function loadViewer(id: string): Promise<Viewer> {
  const [user, token] = await Promise.all([getCurrentUser(), getSessionToken()]);
  if (!user || !token) return { user: null, own: false, myBid: null, favorite: false };
  const favorite = getFavoriteIds(token)
    .then((ids) => ids.includes(id))
    .catch(() => false);
  try {
    if (user.role === 'CUSTOMER') {
      const [own, isFavorite] = await Promise.all([getMyJob(token, id), favorite]);
      return { user, own: own !== null, myBid: null, favorite: isFavorite };
    }
    if (user.role === 'CONTRACTOR') {
      const [bids, isFavorite] = await Promise.all([
        listMyBids(token, 1, { jobId: id, limit: 1 }),
        favorite,
      ]);
      return { user, own: false, myBid: bids.items[0] ?? null, favorite: isFavorite };
    }
  } catch (error) {
    console.error('Job page: failed to load viewer state', error);
  }
  return { user, own: false, myBid: null, favorite: await favorite };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [job, viewer, summary] = await Promise.all([
    loadJob(id),
    loadViewer(id),
    getUnreadSummary(),
  ]);
  if (!job) notFound();
  const own = viewer.own;
  const reported = reportNotice(query.report);
  const notice =
    query.bid === 'sent'
      ? 'Отклик отправлен заказчику.'
      : query.withdrawn
        ? 'Отклик отозван.'
        : null;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-8 sm:px-6 lg:px-10 md:pt-12">
      {/* Отклонённый отклик ведёт сюда: уведомление прочитано, когда карточка открыта. */}
      <MarkSeen jobId={job.id} unread={unreadForJob(summary, job.id)} />
      {reported ? (
        <div className="mt-6">
          <Notice tone={reported.ok ? 'ok' : 'neutral'}>{reported.text}</Notice>
        </div>
      ) : null}
      <nav aria-label="Навигационная цепочка" className="text-sm text-ink-soft">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link
              href="/jobs"
              className="inline-flex min-h-6 items-center hover:text-ink hover:underline"
            >
              Заказы
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={jobsHref({ category: job.category })}
              className="inline-flex min-h-6 items-center hover:text-ink hover:underline"
            >
              {JOB_CATEGORY_LABELS[job.category]}
            </Link>
          </li>
        </ol>
      </nav>

      {own ? (
        <p className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-tint px-4 py-3 text-sm">
          <span className="font-medium">Это ваш заказ.</span>
          <Link
            href={`/account/jobs/${job.id}`}
            className="font-semibold text-accent hover:underline"
          >
            Управлять заказом
          </Link>
        </p>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-12">
        <article>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={job.status} />
            <span className="text-sm text-ink-soft">
              Опубликован <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            {job.title}
          </h1>
          <div className="mt-4">
            <JobHighlights category={job.category} details={job.details} size="md" />
          </div>
          <div className="mt-8">
            <JobPositionsDetails job={job} />
          </div>
          <h2 className="mt-8 text-lg font-semibold">Описание работ</h2>
          <p className="mt-3 max-w-[65ch] whitespace-pre-line leading-relaxed text-ink-soft">
            {job.description}
          </p>
        </article>

        <aside className="h-fit rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-24">
          <dl className="space-y-4">
            <div>
              <dt className="text-sm text-ink-soft">Бюджет</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Город</dt>
              <dd className="mt-1 font-medium">{job.city}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">
                {job.extraItems.length > 0 ? 'Категории' : 'Категория'}
              </dt>
              <dd className="mt-1 font-medium">{jobCategoryLabels(job).join(', ')}</dd>
            </div>
          </dl>
          {own ? null : (
            <RespondPanel
              job={job}
              viewerRole={viewer.user?.role ?? null}
              myBid={viewer.myBid}
              notice={notice}
            />
          )}
          {viewer.user && !own ? (
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <FavoriteButton
                jobId={job.id}
                favorite={viewer.favorite}
                returnTo={`/jobs/${job.id}`}
              />
              <ReportButton targetType="JOB" targetId={job.id} returnTo={`/jobs/${job.id}`} />
            </div>
          ) : null}
        </aside>
      </div>

      <p className="mt-12">
        <Link href="/jobs" className="font-semibold text-accent hover:underline">
          Вернуться к каталогу
        </Link>
      </p>
    </div>
  );
}
