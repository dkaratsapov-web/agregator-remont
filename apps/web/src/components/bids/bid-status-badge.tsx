import { BID_STATUS_LABELS, type BidStatus } from '@agregator/shared';

const STYLES: Record<BidStatus, string> = {
  PENDING: 'bg-muted-tint text-ink',
  ACCEPTED: 'bg-ok-tint text-ok',
  REJECTED: 'bg-muted-tint text-ink-soft',
  WITHDRAWN: 'bg-muted-tint text-ink-soft',
};

export function BidStatusBadge({ status }: { status: BidStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      {BID_STATUS_LABELS[status]}
    </span>
  );
}
