import {
  findServiceCity,
  isJobCategory,
  JOB_DETAILS_LIMITS,
  JOB_LIMITS,
  SERVICE_AREA_ERROR,
  validateJobDetails,
  validateJobItems,
  type JobDetails,
  type JobItem,
  type JobDraftInput,
  type JobInput,
} from '@agregator/shared';

export type JobFormValues = Record<
  | 'title'
  | 'description'
  | 'category'
  | 'city'
  | 'budgetMin'
  | 'budgetMax'
  | 'details'
  | 'extraItems',
  string
>;

export type JobFormField =
  'title' | 'category' | 'city' | 'budget' | 'description' | 'details' | 'items';

export interface JobFormIssue {
  field: JobFormField;
  message: string;
  /** Для field = 'details' и 'items': вопрос анкеты, к которому относится ошибка. */
  questionId?: string | null;
  /** Для field = 'items': номер позиции в заказе (с 2), null — ошибка списка целиком. */
  position?: number | null;
}

export type ParsedJobForm =
  | {
      ok: true;
      input: JobInput & { details: JobDetails; extraItems: JobItem[] };
      values: JobFormValues;
    }
  | { ok: false; error: string; issues: JobFormIssue[]; values: JobFormValues };

/** Ответы анкеты приходят в скрытом поле JSON-строкой; с запасом на экранирование. */
const DETAILS_FIELD_MAX = JOB_DETAILS_LIMITS.MAX_BYTES * 2;
/** Позиции других категорий: до 4 анкет. */
const ITEMS_FIELD_MAX = DETAILS_FIELD_MAX * 4 + 1000;

const text = (form: FormData, key: string, max: number): string => {
  const value = form.get(key);
  return typeof value === 'string' ? value.slice(0, max) : '';
};

/** «120 000», «120000», пусто → число или null; иначе ошибка. */
export function parseBudget(raw: string): number | null | 'invalid' {
  const compact = raw.replace(/[\s\u00a0\u202f]/g, '');
  if (compact === '') return null;
  if (!/^\d{1,10}$/.test(compact)) return 'invalid';
  const value = Number(compact);
  return value <= JOB_LIMITS.BUDGET_MAX ? value : 'invalid';
}

/**
 * JSON из скрытого поля → объект ответов; пустая строка: анкета не заполнена. Битый JSON
 * возвращается как есть (строкой), и проверка анкеты отклонит его как неверный формат.
 */
export function parseDetailsField(raw: string): unknown {
  if (raw.trim() === '') return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

const length = (value: string) => [...value.trim()].length;

/**
 * Проверка значений формы заказа: та же, что делает API, чтобы показать ошибки у полей
 * до отправки. Возвращает нормализованные данные или список ошибок по полям.
 */
export function checkJobForm(
  values: JobFormValues,
):
  | { ok: true; input: JobInput & { details: JobDetails; extraItems: JobItem[] } }
  | { ok: false; issues: JobFormIssue[] } {
  const issues: JobFormIssue[] = [];
  const title = values.title.trim();
  if (length(title) < JOB_LIMITS.TITLE_MIN || length(title) > JOB_LIMITS.TITLE_MAX) {
    issues.push({
      field: 'title',
      message:
        length(title) === 0
          ? 'Напишите, что нужно сделать.'
          : `Название: от ${JOB_LIMITS.TITLE_MIN} до ${JOB_LIMITS.TITLE_MAX} символов.`,
    });
  }

  const category = values.category;
  if (!isJobCategory(category)) {
    issues.push({ field: 'category', message: 'Выберите категорию работ.' });
  }

  const city = findServiceCity(values.city);
  if (!city) {
    issues.push({
      field: 'city',
      message: values.city.trim() === '' ? 'Выберите город из списка.' : `${SERVICE_AREA_ERROR}.`,
    });
  }

  const budgetMin = parseBudget(values.budgetMin);
  const budgetMax = parseBudget(values.budgetMax);
  if (budgetMin === 'invalid' || budgetMax === 'invalid') {
    issues.push({
      field: 'budget',
      message: 'Бюджет укажите целым числом рублей, например 120 000.',
    });
  } else if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    issues.push({ field: 'budget', message: 'Бюджет «от» не может быть больше бюджета «до».' });
  }

  const description = values.description.trim();
  if (
    length(description) < JOB_LIMITS.DESCRIPTION_MIN ||
    length(description) > JOB_LIMITS.DESCRIPTION_MAX
  ) {
    issues.push({
      field: 'description',
      message:
        length(description) < JOB_LIMITS.DESCRIPTION_MIN
          ? `Опишите работы подробнее: не меньше ${JOB_LIMITS.DESCRIPTION_MIN} символов.`
          : `Описание: не больше ${JOB_LIMITS.DESCRIPTION_MAX} символов.`,
    });
  }

  let details: JobDetails = {};
  if (isJobCategory(category)) {
    const result = validateJobDetails(category, parseDetailsField(values.details));
    if (result.ok) details = result.details;
    else {
      for (const error of result.errors) {
        issues.push({ field: 'details', message: error.message, questionId: error.questionId });
      }
    }
  }

  let extraItems: JobItem[] = [];
  if (isJobCategory(category)) {
    const result = validateJobItems(category, parseItemsField(values.extraItems));
    if (result.ok) extraItems = result.items;
    else {
      for (const error of result.errors) {
        issues.push({
          field: 'items',
          message: error.message,
          questionId: error.questionId,
          position: error.position,
        });
      }
    }
  }

  if (issues.length > 0 || !isJobCategory(category) || !city) return { ok: false, issues };
  return {
    ok: true,
    input: {
      title,
      description,
      category,
      city: city.name,
      budgetMin: budgetMin as number | null,
      budgetMax: budgetMax as number | null,
      details,
      extraItems,
    },
  };
}

/** Значения формы из FormData с ограничением длины каждого поля. */
export function readJobForm(form: FormData): JobFormValues {
  return {
    title: text(form, 'title', JOB_LIMITS.TITLE_MAX + 1),
    description: text(form, 'description', JOB_LIMITS.DESCRIPTION_MAX + 1),
    category: text(form, 'category', 40),
    city: text(form, 'city', JOB_LIMITS.CITY_MAX + 1),
    budgetMin: text(form, 'budgetMin', 20),
    budgetMax: text(form, 'budgetMax', 20),
    details: text(form, 'details', DETAILS_FIELD_MAX + 1),
    extraItems: text(form, 'extraItems', ITEMS_FIELD_MAX + 1),
  };
}

/** JSON позиций из скрытого поля; пусто — позиций нет. Битый JSON отклонит проверка. */
export function parseItemsField(raw: string): unknown {
  if (raw.trim() === '') return [];
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Разбор формы заказа в Server Action. Те же правила, что у API (длины, город из зоны
 * обслуживания, анкета категории); окончательно всё проверяет API.
 */
export function parseJobForm(form: FormData): ParsedJobForm {
  const values = readJobForm(form);
  if (values.details.length > DETAILS_FIELD_MAX || values.extraItems.length > ITEMS_FIELD_MAX) {
    return {
      ok: false,
      error: 'Слишком длинные ответы на вопросы.',
      issues: [{ field: 'details', message: 'Слишком длинные ответы на вопросы.' }],
      values: { ...values, details: '', extraItems: '' },
    };
  }
  const checked = checkJobForm(values);
  if (!checked.ok) {
    return { ok: false, error: checked.issues[0].message, issues: checked.issues, values };
  }
  const draftId = draftIdFrom(form);
  const requestId = requestIdFrom(form);
  return {
    ok: true,
    values,
    input: {
      ...checked.input,
      ...(draftId ? { draftId } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ключ публикации из скрытого поля (UUID формы нового заказа); null, если его нет. */
export function requestIdFrom(form: FormData): string | null {
  const value = form.get('requestId');
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

/**
 * Версия (updatedAt) заказа или черновика, с которой работает форма: ISO 8601 из скрытого поля;
 * null, если её нет или значение неверное.
 */
export function versionFrom(form: FormData): string | null {
  const value = form.get('expectedUpdatedAt');
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)
    ? value
    : null;
}

/** id черновика из скрытого поля формы; null, если черновика нет или значение неверное. */
export function draftIdFrom(form: FormData): string | null {
  const value = form.get('draftId');
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

/** Без управляющих символов; в многострочном тексте переводы строк и табы остаются. */
const cleanLine = (value: string, max: number) =>
  value.replace(/\p{C}/gu, '').trim().slice(0, max) || null;
const cleanText = (value: string, max: number) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{C}\n\t]/gu, '')
    .trim()
    .slice(0, max) || null;

/**
 * Черновик из формы: без обязательных проверок. Неверное значение (бюджет буквами, битая
 * анкета) не сохраняется, остальное сохраняется как есть; ответы анкеты API проверит мягко.
 */
export function parseDraftForm(form: FormData): JobDraftInput {
  const values = readJobForm(form);
  const budget = (raw: string) => {
    const value = parseBudget(raw);
    return value === 'invalid' ? null : value;
  };
  const details =
    values.details.length > DETAILS_FIELD_MAX ? {} : parseDetailsField(values.details);
  const items =
    values.extraItems.length > ITEMS_FIELD_MAX ? [] : parseItemsField(values.extraItems);
  return {
    title: cleanLine(values.title, JOB_LIMITS.TITLE_MAX),
    description: cleanText(values.description, JOB_LIMITS.DESCRIPTION_MAX),
    category: isJobCategory(values.category) ? values.category : null,
    city: cleanLine(values.city, JOB_LIMITS.CITY_MAX),
    budgetMin: budget(values.budgetMin),
    budgetMax: budget(values.budgetMax),
    details:
      details !== null && typeof details === 'object' && !Array.isArray(details)
        ? (details as JobDetails)
        : {},
    // Позиции API проверит мягко: неверные отбросит.
    extraItems: Array.isArray(items) ? (items as JobItem[]).slice(0, 4) : [],
  };
}
