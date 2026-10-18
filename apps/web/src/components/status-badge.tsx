import { JOB_STATUS_LABELS, type JobStatus } from '@agregator/shared';

const STYLES: Record<JobStatus, string> = {
  OPEN: 'border-ok/30 text-ok',
  IN_PROGRESS: 'border-accent/35 text-accent',
  CLOSED: 'border-line text-ink-soft',
};

export const JOB_STATUS_DOTS: Record<JobStatus, string> = {
  OPEN: 'bg-ok',
  IN_PROGRESS: 'bg-accent',
  CLOSED: 'bg-ink/30',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border bg-surface px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-[1px] ${JOB_STATUS_DOTS[status]}`} />
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}
