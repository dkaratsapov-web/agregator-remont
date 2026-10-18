import { BID_STATUS_LABELS, type BidStatus } from '@agregator/shared';

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

/** Статус отклика — как у заказа: метка с рамкой и квадратной точкой. */
export function BidStatusBadge({ status }: { status: BidStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border bg-surface px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-[1px] ${BID_STATUS_DOTS[status]}`} />
      {BID_STATUS_LABELS[status]}
    </span>
  );
}
