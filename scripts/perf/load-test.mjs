// Нагрузочный замер API и страниц сайта (docs/audit/LOAD_TEST_REPORT.md). Без зависимостей:
// виртуальные пользователи на fetch, каждый шлёт следующий запрос сразу после ответа (без пауз),
// поэтому N пользователей — это N запросов одновременно, а не N человек на сайте.
//
//   node scripts/perf/load-test.mjs --target api --users 10,50,100,300 --seconds 30
//   node scripts/perf/load-test.mjs --target web --users 10,50,100 --seconds 30
//
// API_URL / WEB_URL — адреса; данные и сеансы — scripts/perf/load-seed.sql (токен
// пользователя i — 'L' и номер, дополненный нулями до 43 символов). Итог — JSON в stdout.
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((part) => part.trim().split(/\s+/)),
);
const TARGET = args.target ?? 'api';
const LEVELS = (args.users ?? '10,50,100,300').split(',').map(Number);
const SECONDS = Number(args.seconds ?? 30);
const JOBS = Number(args.jobs ?? 10_000);
const API = process.env.API_URL ?? 'http://localhost:4100';
const WEB = process.env.WEB_URL ?? 'http://localhost:3100';

const token = (i) => `L${String(i).padStart(42, '0')}`;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const jobId = () => `loadj${1 + Math.floor(Math.random() * JOBS)}`;
const CITIES = ['Москва', 'Казань', 'Самара', 'Тула', 'Пермь'];
const WORDS = ['плитка', 'ламинат', 'кровля', 'паркет', 'обои'];

/** Сценарии API с весами: чтение каталога гостем, кабинет, запись черновика. */
const API_STEPS = [
  [30, 'GET /v1/jobs', () => ({ path: `/v1/jobs?page=${1 + Math.floor(Math.random() * 20)}` })],
  [
    10,
    'GET /v1/jobs (поиск, город, фильтры)',
    () => ({
      path: `/v1/jobs?q=${encodeURIComponent(pick(WORDS))}&city=${encodeURIComponent(pick(CITIES))}&status=OPEN&budgetFrom=20000&sort=budget_desc`,
    }),
  ],
  [15, 'GET /v1/jobs/:id', () => ({ path: `/v1/jobs/${jobId()}` })],
  [10, 'GET /v1/me', () => ({ path: '/v1/me', auth: true })],
  [
    10,
    'GET /v1/me/notifications/summary',
    () => ({ path: '/v1/me/notifications/summary', auth: true }),
  ],
  [5, 'GET /v1/me/notifications', () => ({ path: '/v1/me/notifications', auth: true })],
  [5, 'GET /v1/me/jobs', () => ({ path: '/v1/me/jobs', auth: true })],
  [
    5,
    'GET /v1/price-estimates',
    () => ({ path: `/v1/price-estimates?city=${encodeURIComponent(pick(CITIES))}`, auth: true }),
  ],
  [10, 'POST+DELETE /v1/me/drafts', () => ({ draft: true, auth: true })],
];
/** Страницы сайта (рендер на сервере, сам сайт ходит в API). */
const WEB_STEPS = [
  [40, 'GET /jobs', () => ({ path: `/jobs?page=${1 + Math.floor(Math.random() * 20)}` })],
  [
    20,
    'GET /jobs?q&city',
    () => ({
      path: `/jobs?q=${encodeURIComponent(pick(WORDS))}&city=${encodeURIComponent(pick(CITIES))}`,
    }),
  ],
  [20, 'GET /jobs/:id', () => ({ path: `/jobs/${jobId()}` })],
  [10, 'GET /account (кабинет)', () => ({ path: '/account', auth: true })],
  [10, 'GET /', () => ({ path: '/' })],
];
const STEPS = TARGET === 'web' ? WEB_STEPS : API_STEPS;
const BASE = TARGET === 'web' ? WEB : API;
const TOTAL_WEIGHT = STEPS.reduce((s, [w]) => s + w, 0);
const chooseStep = () => {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const step of STEPS) if ((r -= step[0]) < 0) return step;
  return STEPS[0];
};

// Свой адрес у каждого виртуального пользователя (API за прокси доверяет X-Forwarded-For с
// loopback): лимиты запросов действуют на человека, как в жизни, а не на весь замер разом.
const ipOf = (vu) => `10.77.${Math.floor(vu / 250)}.${1 + (vu % 250)}`;
const headersFor = (vu, user, auth) => {
  const ip = { 'X-Forwarded-For': ipOf(vu) };
  if (!auth) return ip;
  return TARGET === 'web'
    ? { ...ip, Cookie: `ar_session=${token(user)}; __Host-ar_session=${token(user)}` }
    : { ...ip, Authorization: `Bearer ${token(user)}` };
};

async function timed(stats, name, fn) {
  const started = performance.now();
  let status;
  try {
    const res = await fn();
    status = res.status;
    await res.arrayBuffer();
  } catch {
    status = -1;
  }
  const ms = performance.now() - started;
  const s = (stats[name] ??= { ms: [], errors: 0, statuses: {} });
  s.ms.push(ms);
  s.statuses[status] = (s.statuses[status] ?? 0) + 1;
  // 3xx у страниц — переход (например, на вход), не ошибка; 4xx/5xx и обрыв — ошибки.
  if (status < 200 || status >= 400) s.errors += 1;
}

async function virtualUser(vu, deadline, stats) {
  const user = 1 + (vu % 300);
  while (Date.now() < deadline) {
    const [, name, make] = chooseStep();
    const step = make();
    const headers = headersFor(vu, user, step.auth);
    if (step.draft) {
      let id = null;
      await timed(stats, 'POST /v1/me/drafts', async () => {
        const res = await fetch(`${BASE}/v1/me/drafts`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Черновик нагрузки' }),
        });
        if (res.status === 201) id = (await res.clone().json()).id;
        return res;
      });
      if (id) {
        await timed(stats, 'DELETE /v1/me/drafts/:id', () =>
          fetch(`${BASE}/v1/me/drafts/${id}`, { method: 'DELETE', headers }),
        );
      }
      continue;
    }
    await timed(stats, name, () => fetch(BASE + step.path, { headers, redirect: 'manual' }));
  }
}

const pct = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const round = (n) => Math.round(n * 10) / 10;

const results = [];
for (const users of LEVELS) {
  const stats = {};
  const deadline = Date.now() + SECONDS * 1000;
  const started = performance.now();
  await Promise.all(Array.from({ length: users }, (_, i) => virtualUser(i, deadline, stats)));
  const elapsed = (performance.now() - started) / 1000;
  const all = Object.values(stats)
    .flatMap((s) => s.ms)
    .sort((a, b) => a - b);
  const errors = Object.values(stats).reduce((sum, s) => sum + s.errors, 0);
  const level = {
    target: TARGET,
    users,
    seconds: round(elapsed),
    requests: all.length,
    rps: round(all.length / elapsed),
    errorRate: round((errors / Math.max(1, all.length)) * 100),
    p50: round(pct(all, 50)),
    p95: round(pct(all, 95)),
    p99: round(pct(all, 99)),
    endpoints: Object.fromEntries(
      Object.entries(stats).map(([name, s]) => {
        const sorted = s.ms.sort((a, b) => a - b);
        return [
          name,
          {
            n: sorted.length,
            p50: round(pct(sorted, 50)),
            p95: round(pct(sorted, 95)),
            errors: s.errors,
            statuses: s.statuses,
          },
        ];
      }),
    ),
  };
  results.push(level);
  console.error(
    `${TARGET} users=${users}: ${level.rps} req/s, p50 ${level.p50} ms, p95 ${level.p95} ms, p99 ${level.p99} ms, errors ${level.errorRate}%`,
  );
}
console.log(JSON.stringify(results, null, 2));
