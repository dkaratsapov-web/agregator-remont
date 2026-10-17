// Интеграционный тест связки web → API на запущенной production-сборке, без моков.
// Формы отправляются так же, как браузер без JavaScript (progressive enhancement Server Actions).
//
// Ожидаемая конфигурация (как в CI):
//   API: TRUST_PROXY=loopback, AUTH_RATE_LIMIT_PER_MIN=3
//   web: WEB_TRUST_PROXY_HOPS=1 (имитируем reverse proxy, дописывающий IP в X-Forwarded-For)
//   API_PID: PID процесса API — в конце тест останавливает API, чтобы проверить выход при сбое.
const API = process.env.API_URL ?? 'http://localhost:4000';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const AUTH_LIMIT = Number(process.env.AUTH_RATE_LIMIT_PER_MIN ?? 3);

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

const decode = (v) =>
  v
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'");

/** Скрытые поля первой формы Server Action на странице. */
async function actionForm(path, cookie) {
  const page = await (
    await fetch(WEB + path, { headers: cookie ? { Cookie: cookie } : {} })
  ).text();
  // Только формы в <main>: в шапке есть форма выхода из меню кабинета.
  const html = page.slice(Math.max(0, page.indexOf('<main')));
  const form = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].find((m) =>
    m[1].includes('$ACTION'),
  );
  if (!form) throw new Error(`No server action form on ${path}`);
  return [...form[1].matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)].map(
    ([, name, value = '']) => [name, decode(value)],
  );
}

async function submit(path, fields, { origin = WEB, forwardedFor, forwardedHost, cookie } = {}) {
  const body = new FormData();
  for (const [name, value] of await actionForm(path, cookie)) body.append(name, value);
  for (const [name, value] of Object.entries(fields)) body.append(name, value);
  const headers = {};
  if (origin) headers.Origin = origin;
  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor;
  if (forwardedHost) headers['X-Forwarded-Host'] = forwardedHost;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(WEB + path, { method: 'POST', body, headers, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie') ?? '';
  return {
    status: res.status,
    location: res.headers.get('location'),
    setCookie,
    text: await res.text(),
  };
}

const sessionFrom = (setCookie) => /(__Host-ar_session|ar_session)=([^;]*)/.exec(setCookie);

// --- подготовка: пользователь через API
const email = `integration-${Date.now()}@example.ru`;
const password = 'integration-password-123';
const reg = await fetch(`${API}/v1/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, name: 'Интеграционный Тест', role: 'CUSTOMER' }),
});
check('register user via API', reg.status === 201, `got ${reg.status}`);

// --- CSRF: Server Action принимается только с собственного Origin
const login = (opts) => submit('/login', { email, password }, opts);
const good = await login({ forwardedFor: '203.0.113.10' });
const goodSession = sessionFrom(good.setCookie);
check(
  'same-origin login -> 303 + session cookie',
  good.status === 303 && !!goodSession,
  `got ${good.status}`,
);
check(
  'session cookie is HttpOnly; SameSite=Lax',
  /HttpOnly/i.test(good.setCookie) && /SameSite=Lax/i.test(good.setCookie),
);
for (const [name, origin, forwardedHost] of [
  ['foreign Origin', 'https://evil.example'],
  ['foreign Origin + spoofed X-Forwarded-Host', 'https://evil.example', 'evil.example'],
  ['Origin: null', 'null'],
  ['missing Origin', null],
]) {
  const res = await login({ origin, forwardedHost, forwardedFor: '203.0.113.11' });
  check(
    `${name} login is rejected without a session`,
    !sessionFrom(res.setCookie) && res.status !== 303,
    `got ${res.status}`,
  );
}

// --- лимит на вход по IP посетителя через цепочку proxy → web → API
const wrong = (forwardedFor) =>
  submit('/login', { email, password: 'wrong-password-123' }, { forwardedFor });
for (let i = 0; i < AUTH_LIMIT; i += 1) {
  const res = await wrong('198.51.100.1, 203.0.113.20');
  check(
    `attempt ${i + 1} from visitor A -> wrong password`,
    res.text.includes('Неверный email или пароль'),
  );
}
const blocked = await wrong('198.51.100.1, 203.0.113.20');
check('visitor A is rate limited', blocked.text.includes('Слишком много попыток'));
const spoofed = await wrong('198.51.100.99, 198.51.100.98, 203.0.113.20');
check(
  'spoofed leading XFF entries do not reset the limit',
  spoofed.text.includes('Слишком много попыток'),
);
const otherVisitor = await wrong('203.0.113.21');
check('visitor B has a separate limit', otherVisitor.text.includes('Неверный email или пароль'));

// --- выход: cookie удаляется только при подтверждённом отзыве сессии
const cookieA = `${goodSession[1]}=${goodSession[2]}`;
const account = await fetch(`${WEB}/account`, { headers: { Cookie: cookieA }, redirect: 'manual' });
check('account page with session -> 200', account.status === 200, `got ${account.status}`);

const second = sessionFrom((await login({ forwardedFor: '203.0.113.12' })).setCookie);
const cookieB = `${second[1]}=${second[2]}`;

const logoutA = await submit('/account', {}, { cookie: cookieA });
check(
  'logout with API up -> 303 and cookie cleared',
  logoutA.status === 303 && /Max-Age=0/i.test(logoutA.setCookie),
  `got ${logoutA.status}`,
);
const meA = await fetch(`${API}/v1/me`, { headers: { Authorization: `Bearer ${goodSession[2]}` } });
check('revoked session -> 401 in API', meA.status === 401, `got ${meA.status}`);
const meB = await fetch(`${API}/v1/me`, { headers: { Authorization: `Bearer ${second[2]}` } });
check('other session still active', meB.status === 200, `got ${meB.status}`);

if (process.env.API_PID) {
  const accountForm = await actionForm('/account', cookieB);
  process.kill(Number(process.env.API_PID));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const body = new FormData();
  for (const [name, value] of accountForm) body.append(name, value);
  const res = await fetch(`${WEB}/account`, {
    method: 'POST',
    body,
    headers: { Origin: WEB, Cookie: cookieB },
    redirect: 'manual',
  });
  const text = await res.text();
  check('logout with API down shows an error', text.includes('Не удалось выйти'));
  check(
    'logout with API down keeps the cookie',
    !/Max-Age=0/i.test(res.headers.get('set-cookie') ?? ''),
  );
} else {
  console.log('skip logout-with-API-down check (API_PID not set)');
}

if (failures.length > 0) {
  console.error(`\n${failures.length} integration check(s) failed`);
  process.exit(1);
}
console.log('\nAll auth integration checks passed');
