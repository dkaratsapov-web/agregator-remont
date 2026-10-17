import { JOB_CATEGORY_LABELS, type JobBidDto } from '@agregator/shared';
import { acceptBidAction } from '@/app/(site)/account/jobs/actions';
import { formatAmount, formatDate } from '@/lib/format';
import { BidStatusBadge } from './bid-status-badge';
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
    <ul className="space-y-3">
      {bids.map((bid) => {
        const profile = bid.contractor.profile;
        return (
          <li
            key={bid.id}
            className={`rounded-2xl border bg-surface p-5 ${bid.status === 'ACCEPTED' ? 'border-ok' : 'border-line'}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{bid.contractor.name}</p>
                {profile ? (
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {[
                      profile.experienceYears !== null
                        ? `опыт ${profile.experienceYears} лет`
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
              <BidStatusBadge status={bid.status} />
            </div>
            <p className="mt-3 text-lg font-semibold tabular-nums">
              {formatAmount(bid.price)}&nbsp;₽
              {bid.durationDays !== null ? (
                <span className="ml-2 text-sm font-normal text-ink-soft">
                  за {bid.durationDays} дн.
                </span>
              ) : null}
            </p>
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-ink">
              {bid.comment}
            </p>
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
