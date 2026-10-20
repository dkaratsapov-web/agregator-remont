import { JOB_CATEGORY_LABELS, type JobBidDto } from '@agregator/shared';
import { acceptBidAction } from '@/app/(site)/account/jobs/actions';
import { formatAmount, formatDate, formatYears } from '@/lib/format';
import { BidJobChangedNote, BidStatusBadge } from './bid-status-badge';
import { ConfirmActionForm } from './confirm-action-form';

/** Отклики на заказ для его владельца. */
export function JobBidList({
  jobId,
  bids,
  canAccept,
}: {
  jobId: string;
  bids: JobBidDto[];
  canAccept: boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {bids.map((bid) => {
        const profile = bid.contractor.profile;
        return (
          <li key={bid.id} className="relative px-5 py-4 sm:px-6 sm:py-5">
            {bid.status === 'ACCEPTED' ? (
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-ok" />
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{bid.contractor.name}</p>
                {profile ? (
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {[
                      profile.experienceYears !== null
                        ? `опыт ${formatYears(profile.experienceYears)}`
                        : null,
                      profile.categories.map((c) => JOB_CATEGORY_LABELS[c]).join(', ') || null,
                      profile.cities.join(', ') || null,
                    ]
                      .filter(Boolean)
                      .join('; ')}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-ink-soft">Профиль не заполнен</p>
                )}
              </div>
              <BidStatusBadge status={bid.status} rejectReason={bid.rejectReason} />
            </div>
            <p className="mt-3 font-display text-xl font-semibold tabular-nums tracking-[-0.02em]">
              {formatAmount(bid.price)}&nbsp;₽
              {bid.durationDays !== null ? (
                <span className="ml-2 font-sans text-sm font-normal tracking-normal text-ink-soft">
                  за {bid.durationDays} дн.
                </span>
              ) : null}
            </p>
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink">
              {bid.comment}
            </p>
            <BidJobChangedNote
              status={bid.status}
              jobChangedAt={bid.jobChangedAt}
              audience="customer"
            />
            {profile?.about ? (
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink-soft">
                {profile.about}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-ink-soft">
              Отклик от <time dateTime={bid.createdAt}>{formatDate(bid.createdAt)}</time>
            </p>
            {canAccept && bid.status === 'PENDING' ? (
              <div className="mt-4">
                <ConfirmActionForm
                  action={acceptBidAction.bind(null, jobId, bid.id)}
                  summary="Выбрать исполнителем"
                  explanation="Заказ перейдёт в работу, остальные отклики будут отклонены. Отменить выбор нельзя."
                  confirmLabel={`Да, выбрать: ${bid.contractor.name}`}
                  pendingLabel="Выбираем…"
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
