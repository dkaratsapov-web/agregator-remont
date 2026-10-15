import { JOB_STATUS_LABELS, type JobStatus } from '@agregator/shared';

const STYLES: Record<JobStatus, string> = {
  OPEN: 'bg-ok-tint text-ok',
  IN_PROGRESS: 'bg-accent-tint text-accent',
  CLOSED: 'bg-muted-tint text-ink-soft',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}
