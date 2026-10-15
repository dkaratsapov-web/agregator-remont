import type { JobDto } from '@agregator/shared';
import type { Job } from '@prisma/client';

/** Явный whitelist полей: служебные колонки (updatedAt и будущие) не попадают в ответ. */
export function toJobDto(job: Job): JobDto {
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    category: job.category,
    city: job.city,
    budgetMin: job.budgetMin,
    budgetMax: job.budgetMax,
    currency: job.currency,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
  };
}
