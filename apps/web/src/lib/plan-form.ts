import { PLAN_LIMITS, type PlanInput, type StageInput } from '@agregator/shared';
import type { FieldErrors } from './bid-form';

/** Строк этапов в форме: все возможные этапы, чтобы план собирался и без JS. */
export const STAGE_ROWS = PLAN_LIMITS.STAGES_MAX;

export interface StageRowValues {
  title: string;
  description: string;
  durationDays: string;
}

export interface PlanFormValues {
  sequential: boolean;
  stages: StageRowValues[];
}

/** Ключи ошибок: `stage-<номер строки>-title` и т. п., `stages` — про план целиком. */
export type PlanFieldErrors = FieldErrors;

export type ParsedPlanForm =
  | { ok: true; input: PlanInput; values: PlanFormValues }
  | { ok: false; error: string; fields: PlanFieldErrors; values: PlanFormValues };

const text = (form: FormData, key: string, max: number): string => {
  const value = form.get(key);
  return typeof value === 'string' ? value.slice(0, max) : '';
};

export const stageField = (row: number, name: keyof StageRowValues) => `stage-${row}-${name}`;

/**
 * Разбор формы плана. Пустые строки (без названия, описания и срока) пропускаются; порядок —
 * как в форме. Для отправки на согласование нужен хотя бы один этап (`requireStages`).
 * Окончательные правила проверяет API.
 */
export function parsePlanForm(
  form: FormData,
  version: number,
  requireStages: boolean,
): ParsedPlanForm {
  const rows: StageRowValues[] = Array.from({ length: STAGE_ROWS }, (_, row) => ({
    title: text(form, stageField(row, 'title'), PLAN_LIMITS.TITLE_MAX + 1),
    description: text(form, stageField(row, 'description'), PLAN_LIMITS.DESCRIPTION_MAX + 1),
    durationDays: text(form, stageField(row, 'durationDays'), 10),
  }));
  const values: PlanFormValues = { sequential: form.get('sequential') === 'on', stages: rows };
  const fields: PlanFieldErrors = {};
  const stages: StageInput[] = [];

  rows.forEach((row, index) => {
    const title = row.title.trim();
    const description = row.description.trim();
    const days = row.durationDays.trim();
    if (!title && !description && !days) return;
    if (title.length < PLAN_LIMITS.TITLE_MIN || title.length > PLAN_LIMITS.TITLE_MAX) {
      fields[stageField(index, 'title')] =
        `Название этапа: от ${PLAN_LIMITS.TITLE_MIN} до ${PLAN_LIMITS.TITLE_MAX} символов.`;
    }
    if (description.length > PLAN_LIMITS.DESCRIPTION_MAX) {
      fields[stageField(index, 'description')] =
        `Описание: не больше ${PLAN_LIMITS.DESCRIPTION_MAX} символов.`;
    }
    let durationDays: number | null = null;
    if (days) {
      const parsed = /^\d{1,3}$/.test(days) ? Number(days) : NaN;
      if (!(parsed >= 1 && parsed <= PLAN_LIMITS.DURATION_MAX_DAYS)) {
        fields[stageField(index, 'durationDays')] =
          `Срок в днях: от 1 до ${PLAN_LIMITS.DURATION_MAX_DAYS}.`;
      } else {
        durationDays = parsed;
      }
    }
    stages.push({ title, description, durationDays });
  });

  if (requireStages && stages.length === 0 && Object.keys(fields).length === 0) {
    fields.stages = 'Добавьте в план хотя бы один этап.';
  }
  const error = Object.values(fields).find(Boolean);
  if (error) return { ok: false, error, fields, values };
  return { ok: true, input: { version, sequential: values.sequential, stages }, values };
}
