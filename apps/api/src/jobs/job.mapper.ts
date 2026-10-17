import { validateJobDetails, type JobDetails, type JobDto } from '@agregator/shared';
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
    details: readJobDetails(job),
    createdAt: job.createdAt.toISOString(),
  };
}

/**
 * Сохранённые ответы проверены при записи, но анкета могла измениться с тех пор: в ответ попадают
 * только ответы, подходящие текущей анкете категории (мягкий режим проверки).
 */
export function readJobDetails(job: Pick<Job, 'category' | 'details'>): JobDetails {
  const result = validateJobDetails(job.category, job.details, { lenient: true });
  return result.ok ? result.details : {};
}
