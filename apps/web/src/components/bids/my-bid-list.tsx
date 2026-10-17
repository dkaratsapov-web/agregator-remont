import { JOB_STATUS_LABELS, type MyBidDto } from '@agregator/shared';
import Link from 'next/link';
import { withdrawBidAction } from '@/app/(site)/account/bids/actions';
import { formatAmount, formatDate } from '@/lib/format';
import { BidStatusBadge } from './bid-status-badge';
import { ConfirmActionForm } from './confirm-action-form';

export function MyBidList({ bids, returnTo }: { bids: MyBidDto[]; returnTo: string }) {
  return (
    <ul className="space-y-3">
      {bids.map((bid) => (
        <li key={bid.id} className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Link
              href={`/jobs/${bid.job.id}`}
              className="min-w-0 break-words font-semibold hover:underline"
            >
              {bid.job.title}
            </Link>
            <BidStatusBadge status={bid.status} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {bid.job.city}, заказ: {JOB_STATUS_LABELS[bid.job.status].toLowerCase()}. Отклик от{' '}
            <time dateTime={bid.createdAt}>{formatDate(bid.createdAt)}</time>
          </p>
          <p className="mt-2 font-semibold tabular-nums">
            {formatAmount(bid.price)}&nbsp;₽
            {bid.durationDays !== null ? (
              <span className="ml-2 text-sm font-normal text-ink-soft">
                за {bid.durationDays} дн.
              </span>
            ) : null}
          </p>
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
