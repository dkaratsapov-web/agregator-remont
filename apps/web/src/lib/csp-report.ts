/**
 * Отчёты браузеров о нарушениях Content-Security-Policy (`report-uri /csp-report`,
 * docs/SECURITY.md, раздел 3). Нужны, чтобы перед переходом из report-only в enforce увидеть,
 * что политика не мешает настоящим посетителям.
 *
 * В журнал попадает только то, что нужно для решения, без данных людей: директива, источник
 * загрузки без пути и параметров, путь страницы без query и с замаскированными токенами
 * (ссылка сброса пароля содержит токен в пути).
 */

export interface CspViolation {
  /** Нарушенная директива, например `img-src`. */
  directive: string;
  /** Источник: origin (`https://example.com`) или слово браузера (`inline`, `eval`, `data`). */
  blocked: string;
  /** Путь страницы, например `/jobs/:id`. */
  page: string;
  /** `report` — только сообщение, `enforce` — заблокировано. */
  disposition: string;
}

const MAX_PER_REQUEST = 20;
const KEYWORD = /^[a-z-]{1,20}$/;
const DIRECTIVE = /^[a-z-]{1,40}$/;
/** Длинный сегмент пути — токен или идентификатор: в журнал не пишется. */
const TOKEN_SEGMENT = /^[A-Za-z0-9_-]{16,}$|^\d+$/;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Источник загрузки: origin для адреса, слово браузера как есть, иное — `other`. */
export function blockedSource(raw: string): string {
  if (!raw) return 'unknown';
  if (KEYWORD.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    return url.protocol.replace(/:$/, '');
  } catch {
    return 'other';
  }
}

/** Путь страницы без query и fragment, длинные сегменты заменены на `:id`. */
export function pagePath(raw: string): string {
  let path: string;
  try {
    path = new URL(raw).pathname;
  } catch {
    return 'unknown';
  }
  return (
    path
      .split('/')
      .map((segment) => (TOKEN_SEGMENT.test(segment) ? ':id' : segment))
      .join('/')
      .slice(0, 200) || '/'
  );
}

function violation(
  directive: string,
  blocked: string,
  page: string,
  disposition: string,
): CspViolation {
  const name = directive.split(' ')[0] ?? '';
  return {
    directive: DIRECTIVE.test(name) ? name : 'unknown',
    blocked: blockedSource(blocked),
    page: pagePath(page),
    disposition: disposition === 'enforce' ? 'enforce' : 'report',
  };
}

/**
 * Нарушения из тела отчёта. Понимает формат `report-uri` (`{"csp-report": {…}}`) и Reporting
 * API (массив `{type: "csp-violation", body: {…}}`). Неизвестное — пустой список.
 */
export function parseCspReports(body: unknown): CspViolation[] {
  if (Array.isArray(body)) {
    return body
      .filter(
        (r): r is { type: string; body: Record<string, unknown> } =>
          typeof r === 'object' &&
          r !== null &&
          (r as { type?: unknown }).type === 'csp-violation' &&
          typeof (r as { body?: unknown }).body === 'object' &&
          (r as { body?: unknown }).body !== null,
      )
      .slice(0, MAX_PER_REQUEST)
      .map(({ body: b }) =>
        violation(
          str(b.effectiveDirective),
          str(b.blockedURL),
          str(b.documentURL),
          str(b.disposition),
        ),
      );
  }
  if (typeof body === 'object' && body !== null) {
    const report = (body as Record<string, unknown>)['csp-report'];
    if (typeof report === 'object' && report !== null) {
      const r = report as Record<string, unknown>;
      return [
        violation(
          str(r['effective-directive']) || str(r['violated-directive']),
          str(r['blocked-uri']),
          str(r['document-uri']),
          str(r.disposition),
        ),
      ];
    }
  }
  return [];
}

/**
 * Не больше `limit` записей в журнал за минуту на процесс: адрес принимает отчёты от любых
 * браузеров, и поток отчётов не должен засорить журнал. Отброшенные считаются и
 * сообщаются одной строкой в начале следующей минуты.
 */
export function createReportLog(
  write: (line: string) => void,
  limit = 60,
  now: () => number = Date.now,
) {
  let windowStart = now();
  let written = 0;
  let dropped = 0;
  return (violations: CspViolation[]) => {
    const t = now();
    if (t - windowStart >= 60_000) {
      if (dropped > 0) write(JSON.stringify({ event: 'csp-violation-dropped', count: dropped }));
      windowStart = t;
      written = 0;
      dropped = 0;
    }
    for (const v of violations) {
      if (written >= limit) {
        dropped += 1;
        continue;
      }
      written += 1;
      write(JSON.stringify({ event: 'csp-violation', ...v }));
    }
  };
}
