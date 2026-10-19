import { JOB_CLOSE_OUTCOME_LABELS, JOB_STATUS_LABELS, type MyBidDto } from '@agregator/shared';
import Link from 'next/link';
import { withdrawBidAction } from '@/app/(site)/account/bids/actions';
import { formatAmount, formatDate } from '@/lib/format';
import { BidJobChangedNote, BidStatusBadge } from './bid-status-badge';
import { ConfirmActionForm } from './confirm-action-form';

export function MyBidList({ bids, returnTo }: { bids: MyBidDto[]; returnTo: string }) {
  return (
    <ul className="divide-y divide-line">
      {bids.map((bid) => (
        <li key={bid.id} className="px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Link
              href={`/jobs/${bid.job.id}`}
              className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere] hover:underline hover:decoration-accent hover:underline-offset-4"
            >
              {bid.job.title}
            </Link>
            <BidStatusBadge status={bid.status} rejectReason={bid.rejectReason} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {bid.job.city} · заказ{' '}
            {(bid.job.closeOutcome
              ? JOB_CLOSE_OUTCOME_LABELS[bid.job.closeOutcome]
              : JOB_STATUS_LABELS[bid.job.status]
            ).toLowerCase()}{' '}
            · отклик от <time dateTime={bid.createdAt}>{formatDate(bid.createdAt)}</time>
          </p>
          <p className="mt-2 font-display text-lg font-semibold tabular-nums tracking-[-0.02em]">
            {formatAmount(bid.price)}&nbsp;₽
            {bid.durationDays !== null ? (
              <span className="ml-2 font-sans text-sm font-normal tracking-normal text-ink-soft">
                за {bid.durationDays} дн.
              </span>
            ) : null}
          </p>
          <BidJobChangedNote
            status={bid.status}
            jobChangedAt={bid.jobChangedAt}
            audience="contractor"
          />
          {bid.status === 'ACCEPTED' ? (
            <Link
              href={`/account/work/${bid.job.id}`}
              className="mt-3 inline-flex min-h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink/30"
            >
              Ход работ
            </Link>
          ) : null}
          {bid.status === 'PENDING' ? (
            <div className="mt-3">
              <ConfirmActionForm
                action={withdrawBidAction.bind(null, bid.id, returnTo)}
                summary="Отозвать отклик"
                explanation="Заказчик больше не увидит этот отклик. Откликнуться на заказ повторно будет нельзя."
                confirmLabel="Да, отозвать"
                pendingLabel="Отзываем…"
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
