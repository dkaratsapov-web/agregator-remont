import { cookies } from 'next/headers';
import { gateCookieName, gateConfig, isPageNavigation, isValidGatePass } from '@/lib/gate';
import { safeRedirectPath } from '@/lib/redirect';

/**
 * Проверка пропуска тестировщика для Caddy (forward_auth в deploy/Caddyfile). Caddy вызывает
 * этот адрес перед каждым запросом в закрытую часть и пересылает cookie посетителя.
 * 204 — пропуск есть, Caddy пропускает запрос дальше. Иначе ответ отсюда уходит посетителю:
 * переход на страницу в браузере — на /gate, всё остальное (fetch, RSC, POST) — пустой 401
 * без WWW-Authenticate, поэтому системное окно пароля браузера больше не появляется.
 */

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request): Promise<Response> {
  const pass = (await cookies()).get(gateCookieName())?.value;
  if (isValidGatePass(gateConfig(), pass)) return new Response(null, { status: 204 });

  if (isPageNavigation(request.headers)) {
    const next = safeRedirectPath(request.headers.get('x-forwarded-uri') ?? '/');
    return new Response(null, {
      status: 303,
      headers: { ...NO_STORE, Location: `/gate?next=${encodeURIComponent(next)}` },
    });
  }
  return new Response(null, { status: 401, headers: NO_STORE });
}
