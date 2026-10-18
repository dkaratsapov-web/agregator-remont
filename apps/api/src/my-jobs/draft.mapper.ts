import { validateJobDetails, type JobCategory, type JobDraftDto } from '@agregator/shared';
import type { JobDraft } from '@prisma/client';

export function toJobDraftDto(draft: JobDraft): JobDraftDto {
  return {
    id: draft.id,
    title: draft.title,
    description: draft.description,
    category: draft.category as JobCategory | null,
    city: draft.city,
    budgetMin: draft.budgetMin,
    budgetMax: draft.budgetMax,
    details: draftDetails(draft.category as JobCategory | null, draft.details),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

/** Ответы анкеты черновика: только подходящие категории; без категории ответов нет. */
export function draftDetails(category: JobCategory | null, input: unknown) {
  if (!category) return {};
  const result = validateJobDetails(category, input, { lenient: true });
  return result.ok ? result.details : {};
}
