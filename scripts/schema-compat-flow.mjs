// Сценарий для schema-compat-test.sh: node scripts/schema-compat-flow.mjs <old|new> <API_URL>
// Описывает переход «базовый коммит → этот PR» (сейчас: этапы заказа поверх PR #39).
// old — прежний API работает на новой схеме: регистрация, заказ, отклик, правка, выбор
// исполнителя, закрытие с исходом, поиск; пишет созданные id в COMPAT_STATE (JSON).
// new — текущий API читает данные прежнего и работает с ними: заказы и отклики видны, у
// заказа в работе, начатого прежним API, план пустой, его можно составить и согласовать.
import { readFileSync, writeFileSync } from 'node:fs';

const [mode, API] = process.argv.slice(2);
const STATE = process.env.COMPAT_STATE;
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} [${mode} API] ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
let ip = 0;
async function call(path, { method = 'GET', token, body } = {}) {
  ip += 1;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `10.77.${process.pid % 250}.${ip % 250}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const register = async (role) => {
  const res = await call('/v1/auth/register', {
    method: 'POST',
    body: {
      email: `compat-${role.toLowerCase()}-${Date.now()}@example.ru`,
      password: 'compat-password-123',
      name: `Совместимость ${role}`,
      role,
    },
  });
  if (res.status !== 201) throw new Error(`register ${role}: ${res.status}`);
  return res.body.token;
};
const job = {
  title: 'Совместимость: ламинат в спальне',
  description: 'Одна комната, около 18 м², ламинат куплен заказчиком.',
  category: 'FLOORING',
  city: 'Москва',
  budgetMin: 20000,
  budgetMax: 30000,
  details: { covering: 'laminate', area: 18 },
};
const bid = { price: 25000, durationDays: 3, comment: 'Сделаю за три дня, инструмент свой.' };

/** Заказ с выбранным исполнителем через прежний API. */
async function startWork(customer, contractor, edit) {
  const created = await call('/v1/me/jobs', { method: 'POST', token: customer, body: job });
  const placed = await call(`/v1/jobs/${created.body.id}/bids`, {
    method: 'POST',
    token: contractor,
    body: bid,
  });
  if (edit) {
    const edited = await call(`/v1/me/jobs/${created.body.id}`, {
      method: 'PATCH',
      token: customer,
      body: { budgetMax: 32000 },
    });
    check('edits the job after a bid', edited.status === 200, `got ${edited.status}`);
  }
  const accepted = await call(`/v1/me/jobs/${created.body.id}/bids/${placed.body.id}/accept`, {
    method: 'POST',
    token: customer,
  });
  check('accepts the bid', accepted.status === 200, `got ${accepted.status}`);
  return created.body.id;
}

if (mode === 'old') {
  const customer = await register('CUSTOMER');
  const contractor = await register('CONTRACTOR');
  const workJob = await startWork(customer, contractor, true);
  const closedJob = await startWork(customer, contractor, false);
  const closed = await call(`/v1/me/jobs/${closedJob}/close`, {
    method: 'POST',
    token: customer,
    body: { outcome: 'COMPLETED' },
  });
  check('closes a job in progress with an outcome', closed.status === 200, `got ${closed.status}`);
  const search = await call(`/v1/jobs?q=${encodeURIComponent('ламинат в спальне')}&city=Москва`);
  check(
    'catalog search works on the new schema',
    search.status === 200 && search.body.items.length >= 0,
  );
  writeFileSync(STATE, JSON.stringify({ customer, contractor, workJob, closedJob }));
} else {
  const state = JSON.parse(readFileSync(STATE, 'utf8'));
  const mine = await call('/v1/me/jobs?limit=50', { token: state.customer });
  const ids = new Set((mine.body?.items ?? []).map((j) => j.id));
  check('sees jobs created by the old API', ids.has(state.workJob) && ids.has(state.closedJob));
  const closed = mine.body.items.find((j) => j.id === state.closedJob);
  check('old closed job keeps its outcome', closed?.closeOutcome === 'COMPLETED');
  const bids = await call('/v1/me/bids', { token: state.contractor });
  check(
    'contractor bids from the old API are readable',
    bids.status === 200 && bids.body.items.every((b) => b.status === 'ACCEPTED'),
  );
  const plan = await call(`/v1/jobs/${state.workJob}/plan`, { token: state.contractor });
  check(
    'a job started by the old API has an empty plan',
    plan.status === 200 && plan.body.version === 0 && plan.body.stages.length === 0,
    `got ${plan.status}`,
  );
  const draft = await call(`/v1/jobs/${state.workJob}/plan`, {
    method: 'PUT',
    token: state.contractor,
    body: {
      version: 0,
      sequential: true,
      stages: [{ title: 'Укладка ламината', description: '', durationDays: 2 }],
    },
  });
  const proposed = await call(`/v1/jobs/${state.workJob}/plan/propose`, {
    method: 'POST',
    token: state.contractor,
    body: { version: draft.body?.version },
  });
  const approved = await call(`/v1/jobs/${state.workJob}/plan/approve`, {
    method: 'POST',
    token: state.customer,
    body: { version: proposed.body?.version },
  });
  check(
    'plan for that job is drafted, proposed and approved',
    approved.status === 200 && approved.body.status === 'APPROVED',
    `got ${draft.status}/${proposed.status}/${approved.status}`,
  );
}

if (failures.length > 0) process.exit(1);
