import { JOB_CATEGORY_LABELS, validateJobDetails } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiUnavailable } from '@/components/api-unavailable';
import { CloseJobForm } from '@/components/jobs/close-job-form';
import { CustomersOnly } from '@/components/jobs/customers-only';
import { JobDetails, JobHighlights } from '@/components/jobs/job-details';
import { JobForm } from '@/components/jobs/job-form';
import { Notice } from '@/components/notice';
import { StatusBadge } from '@/components/status-badge';
import { JobBidList } from '@/components/bids/job-bid-list';
import { getMyJob, listJobBids } from '@/lib/api';
import { requireCustomerPage } from '@/lib/customer';
import { formatAmount, formatBudget, formatDate } from '@/lib/format';
import { closeJobAction, updateJobAction } from '../actions';

export const metadata: Metadata = { title: 'Мой заказ', robots: { index: false } };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MyJobPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { token } = await requireCustomerPage(`/account/jobs/${id}`);
  if (!token) return <CustomersOnly />;

  let job: Awaited<ReturnType<typeof getMyJob>>;
  let bids: Awaited<ReturnType<typeof listJobBids>> = [];
  try {
    job = await getMyJob(token, id);
    if (job) bids = await listJobBids(token, job.id);
  } catch (error) {
    console.error('My job: failed to load', error);
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <ApiUnavailable />
      </div>
    );
  }
  if (!job) notFound();

  const notice = query.created
    ? 'Заказ опубликован и появился в каталоге.'
    : query.saved
      ? 'Изменения сохранены.'
      : query.closed
        ? 'Заказ закрыт.'
        : query.accepted
          ? 'Исполнитель выбран, заказ в работе.'
          : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 md:pt-14">
      <p className="text-sm text-ink-soft">
        <Link href="/account/jobs" className="hover:text-ink hover:underline">
          Мои заказы
        </Link>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="break-words text-3xl font-semibold tracking-tight">{job.title}</h1>
        <StatusBadge status={job.status} />
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {JOB_CATEGORY_LABELS[job.category]}, {job.city}, опубликован{' '}
        <time dateTime={job.createdAt}>{formatDate(job.createdAt)}</time>{' '}
        <Link href={`/jobs/${job.id}`} className="font-medium text-accent hover:underline">
          Как видят подрядчики
        </Link>
      </p>

      <div className="mt-4">
        <JobHighlights category={job.category} details={job.details} size="md" />
      </div>

      {notice ? (
        <div className="mt-6">
          <Notice>{notice}</Notice>
        </div>
      ) : null}

      {job.editable && !validateJobDetails(job.category, job.details).ok ? (
        // Заказ создан до анкеты (или анкета стала строже): владелец дополняет её в форме ниже.
        <p className="mt-6 rounded-xl border border-accent/40 bg-accent-tint px-4 py-3 text-sm text-ink">
          Анкета заказа заполнена не полностью, подрядчики видят меньше деталей.{' '}
          <a href="#edit-title" className="font-semibold text-accent hover:underline">
            Ответить на вопросы
          </a>
        </p>
      ) : null}

      <div className="mt-10 empty:hidden">
        <JobDetails category={job.category} details={job.details} />
      </div>

      <section aria-labelledby="bids-title" className="mt-10">
        <h2 id="bids-title" className="text-lg font-semibold">
          Отклики <span className="tabular-nums text-ink-soft">{bids.length}</span>
        </h2>
        <div className="mt-4">
          {bids.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-ink-soft">
              {job.status === 'OPEN'
                ? 'Откликов пока нет. Подрядчики увидят заказ в каталоге.'
                : 'Откликов нет.'}
            </p>
          ) : (
            <JobBidList jobId={job.id} bids={bids} canAccept={job.status === 'OPEN'} />
          )}
        </div>
      </section>

      {job.editable ? (
        <>
          <h2 id="edit-title" className="mt-10 scroll-mt-24 text-lg font-semibold">
            Редактирование
          </h2>
          <div className="mt-4">
            <JobForm
              action={updateJobAction.bind(null, job.id)}
              initial={{
                title: job.title,
                description: job.description,
                category: job.category,
                city: job.city,
                budgetMin: job.budgetMin === null ? '' : formatAmount(job.budgetMin),
                budgetMax: job.budgetMax === null ? '' : formatAmount(job.budgetMax),
                details: JSON.stringify(job.details),
              }}
              submitLabel="Сохранить изменения"
              pendingLabel="Сохраняем…"
            />
          </div>
        </>
      ) : (
        <div className="mt-8 space-y-4">
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
            {job.status === 'CLOSED'
              ? 'Заказ закрыт, редактирование недоступно.'
              : 'Исполнитель выбран, заказ в работе. Редактирование недоступно.'}
          </p>
          <dl className="grid gap-4 rounded-2xl border border-line bg-surface p-6">
            <div>
              <dt className="text-sm text-ink-soft">Бюджет</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Описание</dt>
              <dd className="mt-1 whitespace-pre-line break-words leading-relaxed">
                {job.description}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {job.status !== 'CLOSED' ? (
        <div className="mt-10">
          <CloseJobForm action={closeJobAction.bind(null, job.id)} />
        </div>
      ) : null}
    </div>
  );
}
