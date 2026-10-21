/**
 * Параметры формы (номер заказа, этапа, куда вернуться…) — скрытым полем `args`, а не через
 * `action.bind(...)`. Связанное действие в `useActionState` при отправке без JS бесконечно
 * подвешивает рендер ответа и загружает процессор сервера (React 19.3 + Next.js 16.4: каждый
 * рендер создаёт новую ссылку на действие с неразрешённым обещанием аргументов, проверка подписи
 * ждёт его снова и снова) — docs/NO_JS_FORMS.md. Значения — недоверенный ввод, как и прежние
 * связанные аргументы: действие проверяет каждое.
 */
export const ARGS_FIELD = 'args';
const MAX_ARGS = 8;
const MAX_LENGTH = 2048;

export type FormArg = string | number | boolean;

export function encodeFormArgs(values: readonly FormArg[]): string {
  return JSON.stringify(values);
}

/** Параметры из поля `args`: массив строк, чисел и булевых; что-то другое — пустой массив. */
export function readFormArgs(form: FormData): FormArg[] {
  const raw = form.get(ARGS_FIELD);
  if (typeof raw !== 'string' || raw.length > MAX_LENGTH) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > MAX_ARGS) return [];
    return value.every((v) => ['string', 'number', 'boolean'].includes(typeof v))
      ? (value as FormArg[])
      : [];
  } catch {
    return [];
  }
}

export const argString = (value: FormArg | undefined): string =>
  typeof value === 'string' ? value : '';
export const argInt = (value: FormArg | undefined): number =>
  typeof value === 'number' && Number.isInteger(value) ? value : Number.NaN;
export const argBool = (value: FormArg | undefined): boolean => value === true;
