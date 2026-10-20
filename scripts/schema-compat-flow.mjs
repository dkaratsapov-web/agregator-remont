// Сценарий для schema-compat-test.sh: node scripts/schema-compat-flow.mjs <old|new> <API_URL>
// old — прежний API (до PR) работает на новой схеме: регистрация, заказ, отклик, выбор, закрытие,
// поиск в каталоге; пишет созданные id в COMPAT_STATE (JSON).
// new — текущий API читает данные, созданные прежним: заказы и отклики владельцев видны,
// новые поля (исход закрытия, причина отклонения) у старых записей пустые, поиск работает.
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

if (mode === 'old') {
  const customer = await register('CUSTOMER');
  const contractor = await register('CONTRACTOR');
  const created = await call('/v1/me/jobs', { method: 'POST', token: customer, body: job });
  check('creates a job on the new schema', created.status === 201, `got ${created.status}`);
  const bid = await call(`/v1/jobs/${created.body.id}/bids`, {
    method: 'POST',
    token: contractor,
    body: { price: 25000, durationDays: 3, comment: 'Сделаю за три дня, инструмент свой.' },
  });
  check('places a bid', bid.status === 201, `got ${bid.status}`);
  const edited = await call(`/v1/me/jobs/${created.body.id}`, {
    method: 'PATCH',
    token: customer,
    body: { budgetMax: 32000 },
  });
  check('edits the job after a bid', edited.status === 200, `got ${edited.status}`);
  const accepted = await call(`/v1/me/jobs/${created.body.id}/bids/${bid.body.id}/accept`, {
    method: 'POST',
    token: customer,
  });
  check('accepts the bid', accepted.status === 200, `got ${accepted.status}`);
  const closed = await call(`/v1/me/jobs/${created.body.id}/close`, {
    method: 'POST',
    token: customer,
  });
  check(
    'closes the job without an outcome (old contract)',
    closed.status === 200,
    `got ${closed.status}`,
  );
  const other = await call('/v1/me/jobs', { method: 'POST', token: customer, body: job });
  const search = await call(`/v1/jobs?q=${encodeURIComponent('ламинат в спальне')}&city=Москва`);
  check(
    'catalog search uses the new indexes transparently',
    search.status === 200 && search.body.items.some((j) => j.id === other.body.id),
  );
  writeFileSync(
    STATE,
    JSON.stringify({ customer, contractor, closedJob: created.body.id, openJob: other.body.id }),
  );
} else {
  const state = JSON.parse(readFileSync(STATE, 'utf8'));
  const mine = await call('/v1/me/jobs?limit=50', { token: state.customer });
  const closed = mine.body?.items?.find((j) => j.id === state.closedJob);
  check('sees jobs created by the old API', mine.status === 200 && Boolean(closed));
  check(
    'old closed job has no outcome',
    closed?.status === 'CLOSED' && closed?.closeOutcome === null,
  );
  const bids = await call('/v1/me/bids', { token: state.contractor });
  check(
    'contractor bid from the old API is readable',
    bids.status === 200 &&
      bids.body.items[0]?.status === 'ACCEPTED' &&
      bids.body.items[0]?.rejectReason === null,
  );
  // Правка до откликов старым API не ставила пометку: новых полей у старых откликов нет.
  check('old bid has no job-changed mark', bids.body.items[0]?.jobChangedAt === null);
  const close = await call(`/v1/me/jobs/${state.openJob}/close`, {
    method: 'POST',
    token: state.customer,
    body: { outcome: 'CANCELLED' },
  });
  check(
    'closes an old open job with an outcome',
    close.status === 200 && close.body.closeOutcome === 'CANCELLED',
  );
}

if (failures.length > 0) process.exit(1);
