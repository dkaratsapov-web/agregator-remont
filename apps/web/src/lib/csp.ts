/**
 * Content-Security-Policy для web.
 *
 * Скрипты — только с nonce этого ответа: его выдаёт proxy.ts на каждый запрос страницы, Next.js
 * ставит его своим скриптам, а загруженные ими модули разрешает 'strict-dynamic'. Встроенный
 * скрипт без nonce (например, внедрённый через XSS) не выполнится (независимый аудит, AUD-02).
 *
 * Пока отдаётся как Content-Security-Policy-Report-Only: нарушения видны в консоли браузера и
 * приходят отчётом на /csp-report, но ничего не блокируется. Переход на enforce — отдельным
 * решением владельца (docs/SECURITY.md, раздел 3).
 * 'unsafe-eval' и ws: допускаются только в dev (HMR / React Refresh).
 */
export const CSP_HEADER = 'Content-Security-Policy-Report-Only';

export function buildCsp({ dev, nonce }: { dev: boolean; nonce: string }): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(dev ? ['ws:'] : [])],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    // Отчёты о нарушениях — в журнал web (src/app/csp-report/route.ts).
    'report-uri': ['/csp-report'],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
