// Сценарий для schema-compat-test.sh: node scripts/schema-compat-flow.mjs <old|new> <API_URL>
// Описывает переход «базовый коммит → этот PR» (сейчас: переписка и фото поверх этапов).
// old — прежний API работает на новой схеме: заказ, отклик, выбор исполнителя, план, сдача этапа
// (без фото), закрытие с исходом, отказ исполнителя (удаление плана); пишет id в COMPAT_STATE.
// new — текущий API читает данные прежнего: этап, сданный прежним API, без фото; переписка у
// сделки, начатой прежним API, пустая, в неё можно писать с фото; закрытый заказ — только чтение.
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

/** Согласованный план из одного этапа через тот API, на котором запущен сценарий. */
async function approvedPlan(customer, contractor, jobId) {
  const draft = await call(`/v1/jobs/${jobId}/plan`, {
    method: 'PUT',
    token: contractor,
    body: { version: 0, sequential: true, stages: [{ title: 'Укладка', description: '' }] },
  });
  const proposed = await call(`/v1/jobs/${jobId}/plan/propose`, {
    method: 'POST',
    token: contractor,
    body: { version: draft.body?.version },
  });
  const approved = await call(`/v1/jobs/${jobId}/plan/approve`, {
    method: 'POST',
    token: customer,
    body: { version: proposed.body?.version },
  });
  return approved.body;
}

if (mode === 'old') {
  const customer = await register('CUSTOMER');
  const contractor = await register('CONTRACTOR');
  const workJob = await startWork(customer, contractor, true);
  const plan = await approvedPlan(customer, contractor, workJob);
  const submitted = await call(`/v1/jobs/${workJob}/stages/${plan.stages[0].id}/submit`, {
    method: 'POST',
    token: contractor,
    body: { comment: 'Сдано прежним API' },
  });
  check('submits a stage on the new schema', submitted.status === 200, `got ${submitted.status}`);
  const quitJob = await startWork(customer, contractor, false);
  await approvedPlan(customer, contractor, quitJob);
  const quit = await call(`/v1/jobs/${quitJob}/quit`, {
    method: 'POST',
    token: contractor,
    body: { reason: 'Не успеваю по срокам' },
  });
  check(
    'contractor quits (plan deleted) on the new schema',
    quit.status === 204,
    `got ${quit.status}`,
  );
  const closedJob = await startWork(customer, contractor, false);
  const closed = await call(`/v1/me/jobs/${closedJob}/close`, {
    method: 'POST',
    token: customer,
    body: { outcome: 'COMPLETED' },
  });
  check('closes a job in progress with an outcome', closed.status === 200, `got ${closed.status}`);
  writeFileSync(STATE, JSON.stringify({ customer, contractor, workJob, closedJob }));
} else {
  const state = JSON.parse(readFileSync(STATE, 'utf8'));
  const mine = await call('/v1/me/jobs?limit=50', { token: state.customer });
  const ids = new Set((mine.body?.items ?? []).map((j) => j.id));
  check('sees jobs created by the old API', ids.has(state.workJob) && ids.has(state.closedJob));
  const plan = await call(`/v1/jobs/${state.workJob}/plan`, { token: state.customer });
  check(
    'a stage submitted by the old API is read without photos',
    plan.status === 200 &&
      plan.body.stages[0]?.status === 'SUBMITTED' &&
      Array.isArray(plan.body.stages[0]?.photos) &&
      plan.body.stages[0].photos.length === 0,
    `got ${plan.status}`,
  );
  const chat = await call(`/v1/jobs/${state.workJob}/messages`, { token: state.contractor });
  check(
    'a deal started by the old API has an empty conversation open for writing',
    chat.status === 200 && chat.body.items.length === 0 && chat.body.canWrite === true,
    `got ${chat.status}`,
  );
  // PNG 1×1 — фото к сообщению через новый API.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const form = new FormData();
  form.append('body', 'Сообщение в сделке прежнего API');
  form.append('photos', new Blob([png], { type: 'image/png' }), 'dot.png');
  ip += 1;
  const sent = await fetch(`${API}/v1/jobs/${state.workJob}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.customer}`,
      'X-Forwarded-For': `10.78.${process.pid % 250}.${ip % 250}`,
    },
    body: form,
  });
  const sentBody = await sent.json().catch(() => null);
  const photoId = sentBody?.items?.[0]?.photos?.[0]?.id;
  check(
    'sends a message with a photo',
    sent.status === 200 && Boolean(photoId),
    `got ${sent.status}`,
  );
  const photo = await fetch(`${API}/v1/jobs/${state.workJob}/photos/${photoId}?size=thumb`, {
    headers: { Authorization: `Bearer ${state.contractor}` },
  });
  check('the other side reads the photo', photo.status === 200, `got ${photo.status}`);
  const closedChat = await call(`/v1/jobs/${state.closedJob}/messages`, { token: state.customer });
  check(
    'a job closed by the old API: conversation read-only',
    closedChat.status === 200 && closedChat.body.canWrite === false,
    `got ${closedChat.status}`,
  );
}

if (failures.length > 0) process.exit(1);
