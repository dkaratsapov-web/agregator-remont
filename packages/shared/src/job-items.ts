import { validateJobDetails, type JobDetails } from './job-questions';
import { isJobCategory, JOB_CATEGORY_LABELS, type JobCategory } from './jobs';

/**
 * Несколько категорий в одном заказе. Первая позиция — category и details самого заказа;
 * сюда добавляются позиции других категорий, у каждой своя анкета. Подрядчик откликается на
 * заказ целиком.
 */
export const JOB_ITEM_LIMITS = {
  /** Сколько позиций можно добавить к основной (всего в заказе до 5 категорий). */
  MAX_EXTRA: 4,
} as const;

export interface JobItem {
  category: JobCategory;
  details: JobDetails;
}

export interface JobItemsError {
  /** Номер позиции в заказе, начиная с 2 (первая — основная), или null для списка целиком. */
  position: number | null;
  /** Вопрос анкеты, если ошибка в ответе. */
  questionId: string | null;
  message: string;
}

export type JobItemsResult =
  { ok: true; items: JobItem[] } | { ok: false; errors: JobItemsError[]; message: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Проверка дополнительных позиций: список до MAX_EXTRA, у каждой категория из справочника,
 * категории не повторяются и не совпадают с основной, ответы проверяются анкетой категории.
 * В мягком режиме (чтение, черновики) неверные позиции и ответы отбрасываются.
 */
export function validateJobItems(
  mainCategory: JobCategory | null,
  input: unknown,
  options: { lenient?: boolean } = {},
): JobItemsResult {
  const lenient = options.lenient === true;
  const fail = (errors: JobItemsError[]): JobItemsResult => ({
    ok: false,
    errors,
    message: errors[0].message,
  });

  if (input === undefined || input === null) return { ok: true, items: [] };
  if (!Array.isArray(input)) {
    return lenient
      ? { ok: true, items: [] }
      : fail([{ position: null, questionId: null, message: 'Позиции заказа передаются списком' }]);
  }
  if (input.length > JOB_ITEM_LIMITS.MAX_EXTRA && !lenient) {
    return fail([
      {
        position: null,
        questionId: null,
        message: `В заказе может быть не больше ${JOB_ITEM_LIMITS.MAX_EXTRA + 1} категорий`,
      },
    ]);
  }

  const items: JobItem[] = [];
  const errors: JobItemsError[] = [];
  const used = new Set<JobCategory>(mainCategory ? [mainCategory] : []);
  for (const [index, raw] of input.slice(0, JOB_ITEM_LIMITS.MAX_EXTRA).entries()) {
    const position = index + 2;
    const category = isPlainObject(raw) ? raw.category : undefined;
    if (!isJobCategory(category)) {
      if (!lenient)
        errors.push({
          position,
          questionId: null,
          message: `Позиция ${position}: выберите категорию`,
        });
      continue;
    }
    if (used.has(category)) {
      if (!lenient) {
        errors.push({
          position,
          questionId: null,
          message: `Категория «${JOB_CATEGORY_LABELS[category]}» уже есть в заказе`,
        });
      }
      continue;
    }
    used.add(category);
    const details = validateJobDetails(category, (raw as Record<string, unknown>).details ?? {}, {
      lenient,
    });
    if (details.ok) {
      items.push({ category, details: details.details });
    } else {
      for (const error of details.errors) {
        errors.push({
          position,
          questionId: error.questionId,
          message: `Позиция ${position} («${JOB_CATEGORY_LABELS[category]}»): ${error.message}`,
        });
      }
    }
  }
  return errors.length > 0 ? fail(errors) : { ok: true, items };
}
