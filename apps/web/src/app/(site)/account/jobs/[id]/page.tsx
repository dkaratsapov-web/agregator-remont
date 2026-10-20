import { JOB_CLOSE_OUTCOME_LABELS, JOB_STATUS_LABELS, validateJobDetails } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiUnavailable } from '@/components/api-unavailable';
import { CloseJobForm } from '@/components/jobs/close-job-form';
import { CustomersOnly } from '@/components/jobs/customers-only';
import {
  JobHighlights,
  JobPositionsDetails,
  jobCategoryLabels,
} from '@/components/jobs/job-details';
import { JobForm } from '@/components/jobs/job-form';
import { Notice } from '@/components/notice';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState, PageHeader, secondaryLinkClass } from '@/components/ui/page-header';
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { Stamp } from '@/components/ui/stamp';
import { JobBidList } from '@/components/bids/job-bid-list';
import { JobChatPanel } from '@/components/chat/job-chat-panel';
import { JobPlanPanel } from '@/components/plan/job-plan-panel';
import { planNotice } from '@/components/plan/plan-notice';
import { historyCursor, reportNotice } from '@/lib/search-params';
import { getMessages, getMyJob, getPlan, listJobBids } from '@/lib/api';
import { requireCustomerPage } from '@/lib/customer';
import { MarkSeen } from '@/components/notifications/mark-seen';
import { getUnreadSummary, unreadForJob } from '@/lib/notifications-server';
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
  const before = historyCursor(query.before);
  if (!token) return <CustomersOnly />;

  let job: Awaited<ReturnType<typeof getMyJob>>;
  let bids: Awaited<ReturnType<typeof listJobBids>> = [];
  let plan: Awaited<ReturnType<typeof getPlan>> = null;
  let chat: Awaited<ReturnType<typeof getMessages>> = null;
  try {
    job = await getMyJob(token, id);
    if (job) {
      [bids, plan, chat] = await Promise.all([
        listJobBids(token, job.id),
        // План и переписка есть только у заказа с выбранным исполнителем.
        job.status === 'OPEN' ? Promise.resolve(null) : getPlan(token, job.id),
        job.status === 'OPEN' ? Promise.resolve(null) : getMessages(token, job.id, before),
      ]);
    }
  } catch (error) {
    console.error('My job: failed to load', error);
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <ApiUnavailable />
      </div>
    );
  }
  if (!job) notFound();
  const summary = await getUnreadSummary();
  const reported = reportNotice(query.report);

  const notice = query.created
    ? 'Заказ опубликован и появился в каталоге.'
    : query.saved
      ? 'Изменения сохранены.'
      : query.closed
        ? query.closed === 'done'
          ? 'Заказ закрыт как выполненный.'
          : query.closed === 'cancelled'
            ? 'Заказ отменён.'
            : 'Заказ закрыт.'
        : query.accepted
          ? 'Исполнитель выбран, заказ в работе. Составьте план работ вместе с ним.'
          : planNotice(query.plan);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <MarkSeen jobId={job.id} unread={unreadForJob(summary, job.id)} />
      <PageHeader
        back={{ href: '/account/jobs', label: 'Мои заказы' }}
        title={job.title}
        action={
          <Link href={`/jobs/${job.id}`} className={secondaryLinkClass}>
            Как видят подрядчики
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={job.status} />
          <JobHighlights category={job.category} details={job.details} size="sm" />
        </div>
      </PageHeader>

      {notice ? (
        <div className="mt-6">
          <Notice>{notice}</Notice>
        </div>
      ) : null}
      {reported ? (
        <div className="mt-6">
          <Notice tone={reported.ok ? 'ok' : 'neutral'}>{reported.text}</Notice>
        </div>
      ) : null}
      {job.hidden ? (
        <div className="mt-6">
          <Notice tone="neutral">
            Заказ скрыт модератором: в каталоге его не видно, новые отклики не принимаются. Работа с
            выбранным исполнителем продолжается. Если это ошибка, напишите в поддержку.
          </Notice>
        </div>
      ) : null}

      {job.editable && !validateJobDetails(job.category, job.details).ok ? (
        // Заказ создан до анкеты (или анкета стала строже): владелец дополняет её в форме ниже.
        <p className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-accent/40 bg-accent-tint px-4 py-3 text-sm text-ink">
          <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-[1px] bg-accent" />
          <span>
            Анкета заказа заполнена не полностью, подрядчики видят меньше деталей.{' '}
            <a
              href="#edit-title"
              className="font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
            >
              Ответить на вопросы
            </a>
          </span>
        </p>
      ) : null}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-8">
          {plan ? (
            <JobPlanPanel
              plan={plan}
              jobOpen={job.status === 'IN_PROGRESS'}
              returnTo={`/account/jobs/${job.id}`}
            />
          ) : null}
          {chat ? (
            <JobChatPanel
              chat={chat}
              requestId={crypto.randomUUID()}
              earlier={before !== undefined}
              returnTo={`/account/jobs/${job.id}`}
            />
          ) : null}
          <Sheet labelledBy="bids-title" id="bids">
            <SheetHeader
              id="bids-title"
              title={
                <>
                  Отклики <span className="tabular-nums text-ink-soft">{bids.length}</span>
                </>
              }
              description={
                job.status === 'OPEN' && bids.length > 0
                  ? 'Выберите исполнителя — заказ перейдёт в работу, остальные отклики будут отклонены.'
                  : undefined
              }
            />
            {bids.length === 0 ? (
              <EmptyState title="Откликов пока нет">
                {job.status === 'OPEN'
                  ? 'Подрядчики видят заказ в каталоге. Отклики с ценой и сроком появятся здесь.'
                  : 'Заказ больше не принимает отклики.'}
              </EmptyState>
            ) : (
              <JobBidList jobId={job.id} bids={bids} canAccept={job.status === 'OPEN'} />
            )}
          </Sheet>

          <div className="empty:hidden">
            <JobPositionsDetails job={job} />
          </div>

          {job.editable ? null : (
            <Sheet labelledBy="description-title">
              <SheetHeader
                id="description-title"
                title="Описание"
                description={
                  job.status === 'CLOSED'
                    ? 'Заказ закрыт, редактирование недоступно.'
                    : 'Исполнитель выбран, заказ в работе. Редактирование недоступно.'
                }
              />
              <SheetBody>
                <p className="max-w-[72ch] whitespace-pre-line break-words leading-relaxed text-ink">
                  {job.description}
                </p>
              </SheetBody>
            </Sheet>
          )}
        </div>

        <aside aria-label="Сводка заказа" className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Stamp
            ariaLabel="Сводка заказа"
            label="Заказ"
            title={job.title}
            rows={[
              [
                'Статус',
                job.closeOutcome
                  ? `${JOB_STATUS_LABELS[job.status]}: ${JOB_CLOSE_OUTCOME_LABELS[job.closeOutcome].toLowerCase()}`
                  : JOB_STATUS_LABELS[job.status],
              ],
              [
                jobCategoryLabels(job).length > 1 ? 'Категории' : 'Категория',
                jobCategoryLabels(job).join(', '),
              ],
              ['Город', job.city],
              [
                'Бюджет',
                <span key="b" className="tabular-nums">
                  {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
                </span>,
              ],
              [
                'Опубликован',
                <time key="t" dateTime={job.createdAt}>
                  {formatDate(job.createdAt)}
                </time>,
              ],
              [
                'Откликов',
                <span key="n" className="tabular-nums">
                  {bids.length}
                </span>,
              ],
            ]}
            footer={
              job.editable ? (
                <a
                  href="#edit-title"
                  className="inline-flex min-h-6 items-center font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-accent"
                >
                  Изменить заказ
                </a>
              ) : (
                'Только просмотр'
              )
            }
          />
          {job.status !== 'CLOSED' ? (
            <CloseJobForm
              action={closeJobAction.bind(null, job.id)}
              inProgress={job.status === 'IN_PROGRESS'}
            />
          ) : null}
        </aside>
      </div>

      {job.editable ? (
        <section aria-labelledby="edit-title" className="mt-12 border-t border-line pt-8">
          <h2
            id="edit-title"
            className="scroll-mt-24 font-display text-xl font-semibold tracking-[-0.02em] text-ink"
          >
            Редактирование
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Подрядчики увидят изменения сразу после сохранения.
          </p>
          <div className="mt-6">
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
                extraItems: JSON.stringify(job.extraItems),
              }}
              version={job.updatedAt}
              submitLabel="Сохранить изменения"
              pendingLabel="Сохраняем…"
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
