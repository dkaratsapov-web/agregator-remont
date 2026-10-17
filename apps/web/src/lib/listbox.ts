/**
 * Чистые помощники для выпадающих списков (components/ui/select.tsx, city-combobox.tsx):
 * поиск без учёта регистра и ё/е, подсветка совпадения, навигация с клавиатуры, typeahead.
 */

export interface ListOption {
  value: string;
  label: string;
  /** id группы (см. ListGroup); варианты без группы идут первыми. */
  group?: string;
  disabled?: boolean;
}

export interface ListGroup {
  id: string;
  label: string;
}

/** Нижний регистр и ё → е. Длина строки не меняется, поэтому позиции годятся для подсветки. */
export function foldText(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е');
}

/** Запрос для сравнения: свёрнутый регистр, единичные пробелы, без пробелов у дефиса. */
export function normalizeQuery(value: string): string {
  return foldText(value)
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface OptionMatch<T extends ListOption = ListOption> {
  option: T;
  /** [начало, конец) совпадения в label; null, если запрос пуст. */
  match: readonly [number, number] | null;
}

/**
 * Варианты, подходящие под запрос. Порядок: совпадение с начала названия, затем с начала
 * слова, затем в середине; внутри группы сохраняется исходный порядок. Пустой запрос: все.
 */
export function filterOptions<T extends ListOption>(
  options: readonly T[],
  query: string,
  limit = Infinity,
): OptionMatch<T>[] {
  const needle = normalizeQuery(query);
  if (needle === '') return options.slice(0, limit).map((option) => ({ option, match: null }));
  const ranked: { rank: number; index: number; item: OptionMatch<T> }[] = [];
  options.forEach((option, index) => {
    const haystack = foldText(option.label);
    const at = haystack.indexOf(needle);
    if (at === -1) return;
    const rank = at === 0 ? 0 : /[\s\-(«"]/.test(haystack[at - 1]) ? 1 : 2;
    ranked.push({ rank, index, item: { option, match: [at, at + needle.length] } });
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/** Вариант, название которого совпадает с текстом с точностью до регистра, ё/е и пробелов. */
export function findOptionByLabel<T extends ListOption>(
  options: readonly T[],
  text: string,
): T | null {
  const needle = normalizeQuery(text);
  if (needle === '') return null;
  return options.find((option) => normalizeQuery(option.label) === needle) ?? null;
}

/** Части строки для подсветки совпадения. */
export function splitHighlight(
  label: string,
  match: readonly [number, number] | null,
): { text: string; hit: boolean }[] {
  if (!match || match[0] >= match[1]) return [{ text: label, hit: false }];
  const [start, end] = match;
  return [
    { text: label.slice(0, start), hit: false },
    { text: label.slice(start, end), hit: true },
    { text: label.slice(end), hit: false },
  ].filter((part) => part.text !== '');
}

/**
 * Следующий активный индекс при навигации стрелками, Home/End или PageUp/PageDown.
 * Недоступные варианты пропускаются; на краях список не прокручивается по кругу.
 */
export function moveActiveIndex(
  options: readonly { disabled?: boolean }[],
  current: number,
  move: 'next' | 'prev' | 'first' | 'last' | 'pageDown' | 'pageUp',
  pageSize = 8,
): number {
  const enabled = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index !== -1);
  if (enabled.length === 0) return -1;
  switch (move) {
    case 'first':
      return enabled[0];
    case 'last':
      return enabled[enabled.length - 1];
    case 'next':
    case 'pageDown': {
      const step = move === 'next' ? 1 : pageSize;
      if (current < 0) return enabled[0];
      const after = enabled.filter((index) => index > current);
      return after.length === 0 ? current : after[Math.min(step, after.length) - 1];
    }
    case 'prev':
    case 'pageUp': {
      const step = move === 'prev' ? 1 : pageSize;
      if (current < 0) return enabled[enabled.length - 1];
      const before = enabled.filter((index) => index < current);
      return before.length === 0 ? current : before[Math.max(before.length - step, 0)];
    }
  }
}

/**
 * Typeahead: индекс варианта, название которого начинается с набранных букв. Поиск идёт после
 * текущего варианта по кругу; повтор одной и той же буквы перебирает варианты на эту букву.
 */
export function typeaheadIndex(
  options: readonly ListOption[],
  buffer: string,
  current: number,
): number {
  const needle = foldText(buffer);
  if (needle === '') return -1;
  const sameLetter = needle.length > 1 && [...needle].every((char) => char === needle[0]);
  const prefix = sameLetter ? needle[0] : needle;
  // При наборе слова текущий вариант тоже подходит; при переборе одной буквы ищем следующий.
  const offset = needle.length === 1 || sameLetter ? 1 : 0;
  const count = options.length;
  for (let step = 0; step < count; step += 1) {
    const index = (Math.max(current, -1) + offset + step + count) % count;
    const option = options[index];
    if (!option.disabled && foldText(option.label).startsWith(prefix)) return index;
  }
  return -1;
}

/** Группировка для отображения: порядок групп как в `groups`, варианты без группы первыми. */
export function groupItems<T extends { option: ListOption }>(
  items: readonly T[],
  groups: readonly ListGroup[] = [],
): { group: ListGroup | null; items: T[] }[] {
  const result: { group: ListGroup | null; items: T[] }[] = [];
  const loose = items.filter(
    (item) => !item.option.group || !groups.some((g) => g.id === item.option.group),
  );
  if (loose.length > 0) result.push({ group: null, items: loose });
  for (const group of groups) {
    const inGroup = items.filter((item) => item.option.group === group.id);
    if (inGroup.length > 0) result.push({ group, items: inGroup });
  }
  return result;
}
