import { FEEDBACK_KIND_LABELS, FEEDBACK_LIMITS, type FeedbackDto } from '@agregator/shared';
import type { Metadata } from 'next';
import { ApiUnavailable } from '@/components/api-unavailable';
import { FeedbackForm } from '@/components/feedback/feedback-form';
import { FeedbackSeen } from '@/components/feedback/feedback-seen';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { listMyFeedback } from '@/lib/api';
import { requireUserPage } from '@/lib/customer';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Поддержка', robots: { index: false } };

/** Путь страницы, с которой пришли (?from=), — только путь сайта. */
function fromPath(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.length > FEEDBACK_LIMITS.PAGE_MAX) return undefined;
  return /^\/(?!\/)[^\s]*$/.test(value) ? value : undefined;
}

function FeedbackItem({ item }: { item: FeedbackDto }) {
  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold text-ink">
          {FEEDBACK_KIND_LABELS[item.kind]}
          {item.unseen ? (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-xs font-semibold text-accent-ink">
              Новый ответ
            </span>
          ) : null}
        </p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            item.reply ? 'bg-ok-tint text-ok' : 'bg-sunken text-ink-soft'
          }`}
        >
          {item.reply ? 'Есть ответ' : 'Ждёт ответа'}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        <time dateTime={item.createdAt} className="tabular-nums">
          {formatDateTime(item.createdAt)}
        </time>
        {item.page ? <> · страница {item.page}</> : null}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">
        {item.body}
      </p>
      {item.reply ? (
        <div className="mt-3 rounded-xl bg-ok-tint px-4 py-3">
          <p className="text-xs font-semibold text-ok">Ответ поддержки</p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">
            {item.reply}
          </p>
        </div>
      ) : null}
    </li>
  );
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([
    requireUserPage('/account/feedback'),
    searchParams,
  ]);
  const sent = query.sent === '1';
  let mine: FeedbackDto[] | null = null;
  try {
    mine = await listMyFeedback(token);
  } catch (error) {
    console.error('Feedback: failed to load', error);
  }

  const unseen = mine?.filter((item) => item.unseen).length ?? 0;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <FeedbackSeen unseen={unseen} />
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title="Поддержка"
        description="Нашли ошибку, есть идея или вопрос — напишите. Сайт в закрытом тестировании, и каждое обращение читает команда."
      />
      <div className="mt-8 flex max-w-3xl flex-col gap-6">
        {sent ? (
          <p
            role="status"
            className="rounded-[10px] bg-ok-tint px-4 py-3 text-sm font-medium text-ok"
          >
            Обращение отправлено. Ответ появится ниже, в «Моих обращениях».
          </p>
        ) : null}
        <Sheet labelledBy="feedback-form-title">
          <SheetHeader id="feedback-form-title" title="Новое обращение" />
          <SheetBody className="sm:py-6">
            <FeedbackForm from={fromPath(query.from)} />
          </SheetBody>
        </Sheet>
        {mine === null ? (
          <ApiUnavailable />
        ) : (
          <Sheet labelledBy="feedback-mine-title">
            <SheetHeader id="feedback-mine-title" title="Мои обращения" />
            {mine.length === 0 ? (
              <EmptyState title="Обращений пока нет">Ответ на обращение появится здесь.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {mine.map((item) => (
                  <FeedbackItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </Sheet>
        )}
      </div>
    </div>
  );
}
