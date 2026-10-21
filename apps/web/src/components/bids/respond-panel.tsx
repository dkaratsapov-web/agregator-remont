import type { JobDto, MyBidDto, UserRole } from '@agregator/shared';
import Link from 'next/link';
import { placeBidFormAction, withdrawBidFormAction } from '@/app/(site)/account/bids/actions';
import { Notice } from '@/components/notice';
import { formatAmount } from '@/lib/format';
import { BidForm } from './bid-form';
import { BidJobChangedNote, BidStatusBadge } from './bid-status-badge';
import { ConfirmActionForm } from './confirm-action-form';

interface Props {
  job: JobDto;
  viewerRole: UserRole | null;
  myBid: MyBidDto | null;
  notice: string | null;
}

/** Блок отклика на странице заказа: зависит от роли посетителя и его отклика. */
export function RespondPanel({ job, viewerRole, myBid, notice }: Props) {
  const path = `/jobs/${job.id}`;
  return (
    <div className="mt-6 space-y-4 border-t border-line pt-6">
      {notice ? <Notice>{notice}</Notice> : null}
      {viewerRole === null ? (
        <>
          <Link
            href={`/login?next=${encodeURIComponent(path)}`}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-hover"
          >
            Войти и откликнуться
          </Link>
          <p className="text-xs leading-relaxed text-ink-soft">
            Откликаться могут подрядчики.{' '}
            <Link href="/register" className="font-medium text-accent hover:underline">
              Регистрация
            </Link>
          </p>
        </>
      ) : viewerRole !== 'CONTRACTOR' ? (
        <p className="text-sm leading-relaxed text-ink-soft">
          Откликаться на заказы могут только подрядчики.
        </p>
      ) : myBid ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Ваш отклик</p>
            <BidStatusBadge status={myBid.status} rejectReason={myBid.rejectReason} />
          </div>
          <BidJobChangedNote
            status={myBid.status}
            jobChangedAt={myBid.jobChangedAt}
            audience="contractor"
          />
          <p className="font-semibold tabular-nums">
            {formatAmount(myBid.price)}&nbsp;₽
            {myBid.durationDays !== null ? (
              <span className="ml-2 text-sm font-normal text-ink-soft">
                за {myBid.durationDays} дн.
              </span>
            ) : null}
          </p>
          {myBid.status === 'PENDING' ? (
            <ConfirmActionForm
              action={withdrawBidFormAction}
              args={[myBid.id, path]}
              summary="Отозвать отклик"
              explanation="Заказчик больше не увидит этот отклик. Откликнуться повторно будет нельзя."
              confirmLabel="Да, отозвать"
              pendingLabel="Отзываем…"
            />
          ) : null}
          <Link
            href="/account/bids"
            className="inline-flex min-h-6 items-center text-sm font-semibold text-accent hover:underline"
          >
            Все мои отклики
          </Link>
        </div>
      ) : job.status === 'OPEN' ? (
        <BidForm action={placeBidFormAction} args={[job.id]} />
      ) : (
        <p className="text-sm leading-relaxed text-ink-soft">Заказ уже не принимает отклики.</p>
      )}
    </div>
  );
}
