/**
 * Content-Security-Policy для web.
 *
 * Сейчас отдаётся как Content-Security-Policy-Report-Only: нарушения видны в консоли
 * браузера, но ничего не блокируется. План перехода на enforce: docs/SECURITY.md.
 * 'unsafe-inline' в script-src нужен для inline-скриптов App Router до перехода на nonce.
 * 'unsafe-eval' и ws: допускаются только в dev (HMR / React Refresh).
 */
export const CSP_HEADER = 'Content-Security-Policy-Report-Only';

export function buildCsp({ dev }: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
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
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
