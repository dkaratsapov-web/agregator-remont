import {
  PLAN_STATUS_LABELS,
  STAGE_STATUS_LABELS,
  type PlanStatus,
  type StageStatus,
} from '@agregator/shared';

const BADGE =
  'inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border bg-surface px-2 py-0.5 text-xs font-semibold';

const PLAN_STYLES: Record<PlanStatus, [string, string]> = {
  DRAFT: ['border-ink/25 text-ink', 'bg-ink/60'],
  PROPOSED: ['border-accent/35 text-accent', 'bg-accent'],
  APPROVED: ['border-ok/30 text-ok', 'bg-ok'],
};

const STAGE_STYLES: Record<StageStatus, [string, string]> = {
  PLANNED: ['border-line text-ink-soft', 'bg-ink/30'],
  SUBMITTED: ['border-accent/35 text-accent', 'bg-accent'],
  ACCEPTED: ['border-ok/30 text-ok', 'bg-ok'],
  REWORK: ['border-ink/25 text-ink', 'bg-ink/60'],
};

/** Статус плана и этапа — как у заказа: метка с рамкой и квадратной точкой. */
export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const [style, dot] = PLAN_STYLES[status];
  return (
    <span className={`${BADGE} ${style}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-[1px] ${dot}`} />
      План: {PLAN_STATUS_LABELS[status].toLowerCase()}
    </span>
  );
}

export function StageStatusBadge({ status }: { status: StageStatus }) {
  const [style, dot] = STAGE_STYLES[status];
  return (
    <span className={`${BADGE} ${style}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-[1px] ${dot}`} />
      {STAGE_STATUS_LABELS[status]}
    </span>
  );
}
