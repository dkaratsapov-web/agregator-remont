/** Общие правила для пользовательского текста во всех DTO. */
export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** trim + единый перевод строки: браузеры отправляют textarea с \r\n. */
export const trimText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : value;

/** Без управляющих и невидимых символов (bidi-override, нулевые байты, переводы строк). */
export const SINGLE_LINE = /^[^\p{C}]+$/u;

/** Как SINGLE_LINE, но переводы строк и табы разрешены. */
export const MULTI_LINE = /^(?:[^\p{C}]|[\n\r\t])+$/u;

/** Как MULTI_LINE, но допускает пустую строку. */
export const MULTI_LINE_OR_EMPTY = /^(?:[^\p{C}]|[\n\r\t])*$/u;

export const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
