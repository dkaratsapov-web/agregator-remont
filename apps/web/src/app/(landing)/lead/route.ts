import { LEAD_LIMITS, PRIVACY_OPERATOR } from '@agregator/shared';
import { NextResponse } from 'next/server';
import { FOREIGN_ORIGIN, isTrustedOrigin } from '@/lib/action-guard';
import { apiErrorMessage } from '@/lib/action-helpers';
import { submitLead } from '@/lib/api';
import type { LeadResult } from '@/lib/lead-result';
import { readLimitedBody } from '@/lib/read-limited';
import { getClientIp } from '@/lib/session';

/**
 * Заявка на закрытое тестирование с главной. Отдельный адрес, а не Server Action: на открытые
 * адреса Caddy пропускает без пароля только GET/HEAD и единственный POST /lead
 * (deploy/Caddyfile, docs/SECURITY.md, раздел 8). Проверки данных и лимиты — в API.
 *
 * Два формата: JSON от формы с JS (ответ JSON) и обычная HTML-форма без JS
 * (application/x-www-form-urlencoded, ответ — переход 303 на `/?lead=<код>#apply`).
 */

const MAX_BODY = 2_000;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

/** Ответ форме без JS: в адрес — только код результата. */
const back = (result: LeadResult): Response =>
  new Response(null, {
    status: 303,
    headers: { 'Cache-Control': 'no-store', Location: `/?lead=${result}#apply` },
  });

export async function POST(request: Request): Promise<Response> {
  if (!(await isTrustedOrigin())) return fail(403, FOREIGN_ORIGIN);
  const type = request.headers.get('content-type') ?? '';
  if (type.startsWith('application/x-www-form-urlencoded')) return postForm(request);
  if (!type.startsWith('application/json')) {
    return fail(415, 'Неверный формат запроса.');
  }
  if (!PRIVACY_OPERATOR) return fail(503, 'Приём заявок скоро откроется.');

  // Потоком и с лимитом: Content-Length может не быть (chunked) или быть неверным.
  const raw = await readLimitedBody(request, MAX_BODY);
  if (!raw) return fail(413, 'Слишком большой запрос.');

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'Неверный формат запроса.');
  }
  if (body.consent !== true) {
    return fail(400, 'Отметьте согласие на обработку персональных данных.');
  }

  try {
    await submitLead(
      {
        name: text(body.name, LEAD_LIMITS.NAME_MAX + 1),
        phone: text(body.phone, LEAD_LIMITS.PHONE_RAW_MAX + 1),
        consent: true,
        website: text(body.website, 200) || undefined,
      },
      await getClientIp(),
    );
  } catch (error) {
    const message = apiErrorMessage(error, {
      429: 'Слишком много заявок. Попробуйте позже.',
      503: 'Приём заявок скоро откроется.',
    });
    const status = (error as { status?: number }).status;
    return fail(status && status < 500 ? status : 502, message);
  }
  return NextResponse.json({ received: true }, { status: 201 });
}

async function postForm(request: Request): Promise<Response> {
  if (!PRIVACY_OPERATOR) return back('closed');
  const raw = await readLimitedBody(request, MAX_BODY);
  if (!raw) return back('invalid');
  const form = new URLSearchParams(new TextDecoder().decode(raw));
  if (form.get('consent') !== 'on') return back('consent');
  try {
    await submitLead(
      {
        name: text(form.get('name'), LEAD_LIMITS.NAME_MAX + 1),
        phone: text(form.get('phone'), LEAD_LIMITS.PHONE_RAW_MAX + 1),
        consent: true,
        website: text(form.get('website'), 200) || undefined,
      },
      await getClientIp(),
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 429) return back('limit');
    if (status === 503) return back('closed');
    if (status && status >= 400 && status < 500) return back('invalid');
    console.error('Lead form: API failed', status ?? error);
    return back('failed');
  }
  return back('sent');
}
