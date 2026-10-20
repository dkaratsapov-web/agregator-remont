import type { PhotoDto } from './messages';

/**
 * План работ по заказу и его этапы (фаза 2, сделка без денег). Составляет одна сторона —
 * исполнитель или заказчик (настраивает заказчик, пока план не согласован), согласует другая.
 * Этапы сдаёт исполнитель — по порядку или в любом порядке (настройка плана), принимает или
 * возвращает на доработку заказчик. Видят и меняют только заказчик-владелец и выбранный
 * исполнитель.
 */

/** DRAFT — исполнитель правит; PROPOSED — на согласовании у заказчика; APPROVED — согласован. */
export const PLAN_STATUSES = ['DRAFT', 'PROPOSED', 'APPROVED'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: 'Составляется',
  PROPOSED: 'На согласовании',
  APPROVED: 'Согласован',
};

/** PLANNED — впереди; SUBMITTED — сдан, ждёт заказчика; ACCEPTED — принят; REWORK — на доработке. */
export const STAGE_STATUSES = ['PLANNED', 'SUBMITTED', 'ACCEPTED', 'REWORK'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  PLANNED: 'Впереди',
  SUBMITTED: 'Сдан, ждёт проверки',
  ACCEPTED: 'Принят',
  REWORK: 'На доработке',
};

export const PLAN_LIMITS = {
  STAGES_MIN: 1,
  STAGES_MAX: 10,
  TITLE_MIN: 3,
  TITLE_MAX: 120,
  DESCRIPTION_MAX: 2000,
  DURATION_MAX_DAYS: 365,
  /** Причина возврата плана, комментарий к сдаче и к доработке. */
  COMMENT_MIN: 5,
  COMMENT_MAX: 1000,
} as const;

/** Сторона сделки: заказчик-владелец или выбранный исполнитель. */
export const PLAN_PARTIES = ['OWNER', 'CONTRACTOR'] as const;
export type PlanParty = (typeof PLAN_PARTIES)[number];

export const PLAN_PARTY_LABELS: Record<PlanParty, string> = {
  OWNER: 'Заказчик',
  CONTRACTOR: 'Исполнитель',
};

export interface StageInput {
  title: string;
  description: string;
  durationDays: number | null;
}

/** Черновик плана целиком; `version` — версия, которую видел составитель (0 — плана ещё нет). */
export interface PlanInput {
  version: number;
  /** true — этапы сдаются строго по порядку; false — в любом порядке. */
  sequential: boolean;
  stages: StageInput[];
}

export interface JobStageDto {
  id: string;
  /** С 1, по порядку сдачи. */
  position: number;
  title: string;
  description: string;
  durationDays: number | null;
  status: StageStatus;
  /** Комментарий исполнителя к последней сдаче. */
  submitComment: string | null;
  /** Что доработать (последний возврат заказчиком). */
  reworkComment: string | null;
  /** ISO 8601 */
  submittedAt: string | null;
  /** ISO 8601 */
  acceptedAt: string | null;
  /** Фото-отчёт: фото, приложенные исполнителем к сдачам этапа, от старых к новым. */
  photos: PhotoDto[];
}

export interface JobPlanDto {
  jobId: string;
  status: PlanStatus;
  /** Растёт при каждом изменении плана; 0 — плана ещё нет. */
  version: number;
  /** Кто составляет план: он правит и отправляет на согласование, другая сторона согласует. */
  author: PlanParty;
  /** true — этапы сдаются строго по порядку; false — в любом порядке. */
  sequential: boolean;
  /** Почему план вернули на доработку (последний возврат); null — не возвращали. */
  returnReason: string | null;
  /** ISO 8601 */
  proposedAt: string | null;
  /** ISO 8601 */
  approvedAt: string | null;
  stages: JobStageDto[];
  /** Кто смотрит. */
  viewer: PlanParty;
}

/**
 * Этапы, которые исполнитель может сдать сейчас. По порядку — только первый не принятый, если
 * он не на проверке; в любом порядке — все впереди и на доработке.
 */
export function stagesToSubmit(
  plan: Pick<JobPlanDto, 'status' | 'sequential' | 'stages'>,
): JobStageDto[] {
  if (plan.status !== 'APPROVED') return [];
  const open = (stage: JobStageDto) => stage.status === 'PLANNED' || stage.status === 'REWORK';
  if (!plan.sequential) return plan.stages.filter(open);
  const next = plan.stages.find((stage) => stage.status !== 'ACCEPTED');
  return next && open(next) ? [next] : [];
}

/** Все этапы согласованного плана приняты. */
export function planCompleted(plan: Pick<JobPlanDto, 'status' | 'stages'>): boolean {
  return (
    plan.status === 'APPROVED' &&
    plan.stages.length > 0 &&
    plan.stages.every((stage) => stage.status === 'ACCEPTED')
  );
}

/** Отказ исполнителя от заказа после выбора: причина обязательна. */
export const QUIT_REASON_LIMITS = { MIN: 5, MAX: 1000 } as const;
