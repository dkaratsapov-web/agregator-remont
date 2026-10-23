import { createReportLog, parseCspReports } from '@/lib/csp-report';
import { readLimitedBody } from '@/lib/read-limited';

/**
 * Приёмник отчётов о нарушениях CSP (`report-uri /csp-report` в apps/web/src/lib/csp.ts).
 * Пишет в журнал web по строке на нарушение, без данных людей (src/lib/csp-report.ts).
 * В закрытом тесте адрес за паролем тестировщика, как и всё, кроме открытых адресов
 * deploy/Caddyfile: отчёты приходят от браузеров тестировщиков.
 */

const MAX_BODY = 8_000;
const TYPES = ['application/csp-report', 'application/reports+json', 'application/json'];

const log = createReportLog((line) => console.warn(line));

export async function POST(request: Request): Promise<Response> {
  const type = request.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (!TYPES.includes(type)) return new Response(null, { status: 415 });
  const raw = await readLimitedBody(request, MAX_BODY);
  if (!raw) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new Response(null, { status: 400 });
  }
  log(parseCspReports(body));
  return new Response(null, { status: 204 });
}
