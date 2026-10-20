import {
  BID_REJECT_REASON_LABELS,
  BID_STATUS_LABELS,
  type BidRejectReason,
  type BidStatus,
} from '@agregator/shared';
import { formatDate } from '@/lib/format';

const STYLES: Record<BidStatus, string> = {
  PENDING: 'border-ink/25 text-ink',
  ACCEPTED: 'border-ok/30 text-ok',
  REJECTED: 'border-line text-ink-soft',
  WITHDRAWN: 'border-line text-ink-soft',
};

export const BID_STATUS_DOTS: Record<BidStatus, string> = {
  PENDING: 'bg-ink/60',
  ACCEPTED: 'bg-ok',
  REJECTED: 'bg-ink/30',
  WITHDRAWN: 'bg-ink/30',
};

/**
 * Статус отклика — как у заказа: метка с рамкой и квадратной точкой. У отклонённого вместо
 * «Не выбран» — причина: выбран другой исполнитель или заказ закрыт.
 */
export function BidStatusBadge({
  status,
  rejectReason = null,
}: {
  status: BidStatus;
  rejectReason?: BidRejectReason | null;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border bg-surface px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-[1px] ${BID_STATUS_DOTS[status]}`} />
      {status === 'REJECTED' && rejectReason
        ? BID_REJECT_REASON_LABELS[rejectReason]
        : BID_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Пометка у ожидающего отклика, если заказчик изменил заказ после него (решение владельца по
 * AUDIT_FINDINGS MVP-3): подрядчику — проверить условия, заказчику — что цена дана раньше.
 */
export function BidJobChangedNote({
  status,
  jobChangedAt,
  audience,
}: {
  status: BidStatus;
  jobChangedAt: string | null;
  audience: 'contractor' | 'customer';
}) {
  if (status !== 'PENDING' || !jobChangedAt) return null;
  const when = <time dateTime={jobChangedAt}>{formatDate(jobChangedAt)}</time>;
  return (
    <p className="mt-2 flex items-start gap-2 text-sm text-ink">
      <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-[1px] bg-accent" />
      <span>
        {audience === 'contractor' ? (
          <>Заказ изменён после вашего отклика ({when}). Проверьте описание и бюджет.</>
        ) : (
          <>Отклик дан до изменения заказа ({when}): цена и срок рассчитаны по прежним условиям.</>
        )}
      </span>
    </p>
  );
}
