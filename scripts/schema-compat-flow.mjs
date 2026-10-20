// Сценарий для schema-compat-test.sh: node scripts/schema-compat-flow.mjs <old|new> <API_URL>
// Описывает переход «базовый коммит → этот PR» (сейчас: уведомления поверх переписки).
// old — прежний API работает на новой схеме: заказ, отклик, выбор исполнителя, план, сдача этапа,
// сообщение, закрытие с исходом, отказ исполнителя (удаление плана); пишет id в COMPAT_STATE.
// Прежний API уведомлений не пишет.
// new — текущий API читает данные прежнего: этап и переписка на месте, уведомлений у этих
// пользователей нет; новые события в сделке прежнего API дают уведомления другой стороне.
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
  const message = await call(`/v1/jobs/${workJob}/messages`, {
    method: 'POST',
    token: customer,
    body: { body: 'Сообщение прежнего API' },
  });
  check('sends a message on the new schema', message.status === 200, `got ${message.status}`);
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
  writeFileSync(
    STATE,
    JSON.stringify({ customer, contractor, workJob, closedJob, stageId: plan.stages[0].id }),
  );
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
    'the conversation written by the old API is read',
    chat.status === 200 && chat.body.items.length === 1 && chat.body.canWrite === true,
    `got ${chat.status}`,
  );
  for (const [who, token] of [
    ['customer', state.customer],
    ['contractor', state.contractor],
  ]) {
    const list = await call('/v1/me/notifications', { token });
    check(
      `${who}: no notifications from old API events`,
      list.status === 200 && list.body.items.length === 0 && list.body.unread === 0,
      `got ${list.status}`,
    );
  }
  const accepted = await call(`/v1/jobs/${state.workJob}/stages/${state.stageId}/accept`, {
    method: 'POST',
    token: state.customer,
  });
  const sent = await call(`/v1/jobs/${state.workJob}/messages`, {
    method: 'POST',
    token: state.customer,
    body: { body: 'Сообщение нового API' },
  });
  const after = await call('/v1/me/notifications', { token: state.contractor });
  check(
    'new events in an old deal notify the other side',
    accepted.status === 200 &&
      sent.status === 200 &&
      after.body?.items.map((n) => n.kind).join(',') === 'MESSAGE,STAGE_ACCEPTED',
    after.body?.items.map((n) => n.kind).join(','),
  );
  const read = await call('/v1/me/notifications/read', {
    method: 'POST',
    token: state.contractor,
    body: { jobId: state.workJob },
  });
  check('marks them read', read.status === 200 && read.body.unread === 0, `got ${read.status}`);
  const closedChat = await call(`/v1/jobs/${state.closedJob}/messages`, { token: state.customer });
  check(
    'a job closed by the old API: conversation read-only',
    closedChat.status === 200 && closedChat.body.canWrite === false,
    `got ${closedChat.status}`,
  );
}

if (failures.length > 0) process.exit(1);
