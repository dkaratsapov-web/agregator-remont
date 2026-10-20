import type { JobPlanDto, JobStageDto, PlanParty } from '@agregator/shared';
import type { JobPlan, JobStage } from '@prisma/client';
import { toPhotoDto, type PhotoRow } from '../photos/photos.service';

/** Этапы с фото-отчётом; у только что сохранённого черновика фото нет и они не читаются. */
export type PlanWithStages = JobPlan & { stages: (JobStage & { photos?: PhotoRow[] })[] };

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export function toStageDto(stage: JobStage & { photos?: PhotoRow[] }): JobStageDto {
  return {
    id: stage.id,
    position: stage.position,
    title: stage.title,
    description: stage.description,
    durationDays: stage.durationDays,
    status: stage.status,
    submitComment: stage.submitComment,
    reworkComment: stage.reworkComment,
    submittedAt: iso(stage.submittedAt),
    acceptedAt: iso(stage.acceptedAt),
    photos: (stage.photos ?? []).map(toPhotoDto),
  };
}

/** План для стороны сделки; плана ещё нет — пустой черновик версии 0 (составитель — исполнитель). */
export function toPlanDto(
  jobId: string,
  plan: PlanWithStages | null,
  viewer: PlanParty,
): JobPlanDto {
  return {
    jobId,
    status: plan?.status ?? 'DRAFT',
    version: plan?.version ?? 0,
    author: plan?.author ?? 'CONTRACTOR',
    sequential: plan?.sequential ?? true,
    returnReason: plan?.returnReason ?? null,
    proposedAt: iso(plan?.proposedAt ?? null),
    approvedAt: iso(plan?.approvedAt ?? null),
    stages: [...(plan?.stages ?? [])].sort((a, b) => a.position - b.position).map(toStageDto),
    viewer,
  };
}
