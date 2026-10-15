// Smoke-тест запущенной production-сборки: node scripts/smoke.mjs
// Ожидает API на API_URL (по умолчанию :4000) и web на WEB_URL (по умолчанию :3000)
// с применёнными миграциями и демо-сидом.
const API = process.env.API_URL ?? 'http://localhost:4000';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const WAIT_MS = 60_000;

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

async function waitFor(url) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // сервер ещё не поднялся
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function expectStatus(url, status) {
  const res = await fetch(url, { redirect: 'manual' });
  check(`${url} -> ${status}`, res.status === status, `got ${res.status}`);
  return res;
}

await waitFor(`${API}/health`);
await waitFor(`${WEB}/offline`);

const health = await expectStatus(`${API}/health`, 200);
check('health body', JSON.stringify(await health.json()) === '{"status":"ok"}');

const list = await (await expectStatus(`${API}/v1/jobs?page=1&limit=2`, 200)).json();
check('jobs pagination shape', list.page === 1 && list.limit === 2 && list.items.length === 2);
check('jobs seeded', list.total > 0, `total=${list.total}`);
await expectStatus(`${API}/v1/jobs?limit=51`, 400);
await expectStatus(`${API}/v1/jobs/does-not-exist`, 404);

await expectStatus(`${WEB}/`, 200);
await expectStatus(`${WEB}/jobs`, 200);
await expectStatus(`${WEB}/jobs?page=2`, 200);
const detail = await expectStatus(`${WEB}/jobs/${list.items[0].id}`, 200);
check('job page renders title from API', (await detail.text()).includes(list.items[0].title));
await expectStatus(`${WEB}/jobs/does-not-exist`, 404);
await expectStatus(`${WEB}/manifest.webmanifest`, 200);

const headers = (await fetch(`${WEB}/jobs`)).headers;
const csp = headers.get('content-security-policy-report-only') ?? '';
check('CSP report-only header present', csp.includes("default-src 'self'"));
check('CSP has no unsafe-eval in production', !csp.includes('unsafe-eval'));
check('X-Frame-Options DENY', headers.get('x-frame-options') === 'DENY');
check('no X-Powered-By', headers.get('x-powered-by') === null);

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke checks passed');
