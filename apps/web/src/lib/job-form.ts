import { isJobCategory, JOB_LIMITS, type JobInput } from '@agregator/shared';

export type JobFormValues = Record<
  'title' | 'description' | 'category' | 'city' | 'budgetMin' | 'budgetMax',
  string
>;

export type ParsedJobForm =
  | { ok: true; input: JobInput; values: JobFormValues }
  | { ok: false; error: string; values: JobFormValues };

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
 * Разбор формы заказа. Проверяется только то, что нужно для отправки в API;
 * все правила (длины, символы, диапазон бюджета) окончательно проверяет API.
 */
export function parseJobForm(form: FormData): ParsedJobForm {
  const values: JobFormValues = {
    title: text(form, 'title', JOB_LIMITS.TITLE_MAX + 1),
    description: text(form, 'description', JOB_LIMITS.DESCRIPTION_MAX + 1),
    category: text(form, 'category', 40),
    city: text(form, 'city', JOB_LIMITS.CITY_MAX + 1),
    budgetMin: text(form, 'budgetMin', 20),
    budgetMax: text(form, 'budgetMax', 20),
  };

  if (!isJobCategory(values.category)) {
    return { ok: false, error: 'Выберите категорию работ.', values };
  }
  const budgetMin = parseBudget(values.budgetMin);
  const budgetMax = parseBudget(values.budgetMax);
  if (budgetMin === 'invalid' || budgetMax === 'invalid') {
    return { ok: false, error: 'Бюджет укажите целым числом рублей, например 120 000.', values };
  }
  if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    return { ok: false, error: 'Бюджет «от» не может быть больше бюджета «до».', values };
  }

  return {
    ok: true,
    values,
    input: {
      title: values.title,
      description: values.description,
      category: values.category,
      city: values.city,
      budgetMin,
      budgetMax,
    },
  };
}
