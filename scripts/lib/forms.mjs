// Отправка Server Action форм так же, как это делает браузер без JavaScript.
export const API = process.env.API_URL ?? 'http://localhost:4000';
export const WEB = process.env.WEB_URL ?? 'http://localhost:3000';

export function createChecker() {
  const failures = [];
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
    if (!ok) failures.push(name);
  };
  const finish = (label) => {
    if (failures.length > 0) {
      console.error(`\n${failures.length} ${label} check(s) failed`);
      process.exit(1);
    }
    console.log(`\nAll ${label} checks passed`);
  };
  return { check, finish };
}

const decode = (v) =>
  v
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'");

/** Скрытые поля Server Action формы на странице; `pick` выбирает форму по её HTML. */
export async function actionForm(path, { cookie, pick = () => true } = {}) {
  // Без перехода по редиректам: иначе при потерянной сессии скрипт взял бы форму входа.
  const res = await fetch(WEB + path, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: 'manual',
  });
  if (res.status !== 200) throw new Error(`GET ${path} -> HTTP ${res.status} (expected 200)`);
  const html = await res.text();
  const form = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].find(
    (m) => m[1].includes('$ACTION') && pick(m[1]),
  );
  if (!form) throw new Error(`No matching server action form on ${path} (HTTP ${res.status})`);
  return [...form[1].matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)].map(
    ([, name, value = '']) => [name, decode(value)],
  );
}

export async function submit(path, fields, opts = {}) {
  const { origin = WEB, forwardedFor, forwardedHost, cookie, pick } = opts;
  const body = new FormData();
  for (const [name, value] of await actionForm(path, { cookie, pick })) body.append(name, value);
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  const headers = {};
  if (origin) headers.Origin = origin;
  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor;
  if (forwardedHost) headers['X-Forwarded-Host'] = forwardedHost;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(WEB + path, { method: 'POST', body, headers, redirect: 'manual' });
  return {
    status: res.status,
    location: res.headers.get('location'),
    setCookie: res.headers.get('set-cookie') ?? '',
    text: await res.text(),
  };
}

export const sessionFrom = (setCookie) => /(__Host-ar_session|ar_session)=([^;]*)/.exec(setCookie);

/** Cookie сессии web для токена от API: под обоими именами (production и dev), web читает своё. */
export const sessionCookie = (token) => `__Host-ar_session=${token}; ar_session=${token}`;

let counter = 0;
/** Регистрация через API; уникальный X-Forwarded-For, чтобы не упираться в лимит на вход. */
export async function registerViaApi(role) {
  counter += 1;
  const res = await fetch(`${API}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${counter}` },
    body: JSON.stringify({
      email: `it-${role.toLowerCase()}-${Date.now()}-${counter}@example.ru`,
      password: 'integration-password-123',
      name: `Интеграция ${counter}`,
      role,
    }),
  });
  if (res.status !== 201) throw new Error(`register ${role} -> ${res.status}`);
  const body = await res.json();
  return {
    ...body,
    cookie: sessionCookie(body.token),
    auth: { Authorization: `Bearer ${body.token}` },
  };
}
