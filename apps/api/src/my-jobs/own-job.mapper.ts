import type { OwnJobDto } from '@agregator/shared';
import type { Job } from '@prisma/client';
import { toJobDto } from '../jobs/job.mapper';

export function toOwnJobDto(job: Job): OwnJobDto {
  return {
    ...toJobDto(job),
    updatedAt: job.updatedAt.toISOString(),
    editable: job.status === 'OPEN',
    closeOutcome: job.closeOutcome,
    hidden: job.hiddenAt !== null,
  };
}
