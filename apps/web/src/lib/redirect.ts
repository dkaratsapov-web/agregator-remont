export const DEFAULT_AFTER_LOGIN = '/account';

/**
 * Разрешает возврат только на относительные пути этого сайта, чтобы ?next=
 * нельзя было использовать для открытого редиректа на чужой домен.
 */
export function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return DEFAULT_AFTER_LOGIN;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\'))
    return DEFAULT_AFTER_LOGIN;
  // Управляющие символы (в т.ч. табы и переводы строк, которые браузер вырезает из URL).
  // eslint-disable-next-line no-control-regex -- проверка на управляющие символы и есть цель
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_AFTER_LOGIN;
  try {
    const url = new URL(raw, 'http://internal.invalid');
    if (url.origin !== 'http://internal.invalid') return DEFAULT_AFTER_LOGIN;
    // Нормализация убирает «.» и «..»: «/.//evil.example» становится «//evil.example», а это
    // адрес чужого сайта. Проверяем уже нормализованный путь.
    if (url.pathname.startsWith('//')) return DEFAULT_AFTER_LOGIN;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
}
