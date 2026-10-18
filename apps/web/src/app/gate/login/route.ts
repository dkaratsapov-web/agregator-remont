import { headers } from 'next/headers';
import {
  checkGateCredentials,
  GATE_TTL_SECONDS,
  gateConfig,
  gateCookieName,
  finishGateAttempt,
  issueGatePass,
  reserveGateAttempt,
  resetGateFailures,
} from '@/lib/gate';
import { readLimitedBody } from '@/lib/read-limited';
import { isSameOriginRequest } from '@/lib/same-origin';
import { safeRedirectPath } from '@/lib/redirect';
import { getClientIp } from '@/lib/session';

/**
 * Форма входа тестировщика (страница /gate). Отдельный адрес, а не Server Action: Caddy
 * пропускает без пароля только этот POST и POST /lead (deploy/Caddyfile). Обычная HTML-форма:
 * работает и без JavaScript, ответ — переход (303) на нужную страницу или обратно на /gate.
 */

export const dynamic = 'force-dynamic';

const MAX_BODY = 2_000;

function back(error: string, next: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      'Cache-Control': 'no-store',
      Location: `/gate?error=${error}&next=${encodeURIComponent(next)}`,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  // Форма должна быть отправлена с этого же сайта (Origin и Sec-Fetch-Site). Сравнение с хостом
  // запроса, а не с WEB_PUBLIC_ORIGIN: здесь защищаться нужно только от чужих страниц в браузере
  // жертвы (подделать Host браузер не даёт), а адрес за Caddy может отличаться от публичного.
  const h = await headers();
  if (!isSameOriginRequest((name) => h.get(name))) return back('origin', '/');

  const raw = await readLimitedBody(request, MAX_BODY);
  if (!raw) return back('invalid', '/');
  const form = new URLSearchParams(new TextDecoder().decode(raw));
  const next = safeRedirectPath(form.get('next') ?? '/');

  const config = gateConfig();
  if (!config) {
    console.error('Gate: BASIC_AUTH_USER/BASIC_AUTH_HASH are not set, tester login is disabled');
    return back('unavailable', next);
  }

  const ip = (await getClientIp()) ?? 'unknown';
  const attempt = reserveGateAttempt(ip);
  if (attempt !== 'ok') return back(attempt, next);

  let ok: boolean;
  try {
    ok = await checkGateCredentials(config, form.get('login') ?? '', form.get('password') ?? '');
  } finally {
    finishGateAttempt();
  }
  if (!ok) return back('wrong', next);

  resetGateFailures(ip);
  const secure = process.env.NODE_ENV === 'production';
  const cookie = [
    `${gateCookieName()}=${issueGatePass(config)}`,
    'Path=/',
    `Max-Age=${GATE_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
  return new Response(null, {
    status: 303,
    headers: { 'Cache-Control': 'no-store', Location: next, 'Set-Cookie': cookie },
  });
}
