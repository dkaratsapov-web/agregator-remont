import {
  validateJobDetails,
  validateJobItems,
  type JobCategory,
  type JobDraftDto,
  type JobItem,
} from '@agregator/shared';
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
    extraItems: draftItems(draft.category as JobCategory | null, draft.extraItems),
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

/** Позиции черновика, проверенные мягко: неверные и повторяющиеся отбрасываются. */
export function draftItems(category: JobCategory | null, input: unknown): JobItem[] {
  const result = validateJobItems(category, input, { lenient: true });
  return result.ok ? result.items : [];
}
