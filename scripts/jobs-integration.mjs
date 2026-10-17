// Интеграционный тест заказов заказчика: web → API на production-сборке, без моков.
// Требует WEB_PUBLIC_ORIGIN = адрес web (как в CI) и запущенные API и web.
import { API, WEB, createChecker, registerViaApi, submit } from './lib/forms.mjs';

const { check, finish } = createChecker();
const job = {
  title: 'Интеграционный заказ: укладка плитки',
  category: 'TILING',
  city: 'Санкт-Петербург',
  budgetMin: '40 000',
  budgetMax: '60 000',
  description: 'Укладка плитки в ванной, около 20 м². Материалы заказчика.',
  // Обязательные вопросы анкеты плитки (packages/shared/src/job-questions.ts).
  details: JSON.stringify({
    rooms: ['bathroom'],
    surfaces: ['floor'],
    floorArea: 6,
    tileType: 'ceramic',
  }),
};

const owner = await registerViaApi('CUSTOMER');
const stranger = await registerViaApi('CUSTOMER');
const contractor = await registerViaApi('CONTRACTOR');
const ownerJobs = async () =>
  (await (await fetch(`${API}/v1/me/jobs?limit=50`, { headers: owner.auth })).json()).total;

// --- создание через форму
const created = await submit('/account/jobs/new', job, { cookie: owner.cookie });
const id = /\/account\/jobs\/([^?]+)\?created=1/.exec(created.location ?? '')?.[1];
check(
  'owner creates a job via the form -> 303',
  created.status === 303 && !!id,
  `got ${created.status}`,
);

const publicJob = await fetch(`${API}/v1/jobs/${id}`);
const publicBody = await publicJob.json();
check(
  'job is public with parsed budgets',
  publicBody.budgetMin === 40000 && publicBody.budgetMax === 60000,
);
check(
  'public job does not expose the owner',
  !('ownerId' in publicBody) && !JSON.stringify(publicBody).includes(owner.user.id),
);

// --- CSRF: чужой Origin, в том числе с подделанным X-Forwarded-Host
const before = await ownerJobs();
const foreign = await submit('/account/jobs/new', job, {
  cookie: owner.cookie,
  origin: 'https://evil.example',
});
check('foreign Origin cannot create a job', foreign.status !== 303, `got ${foreign.status}`);
const spoofed = await submit('/account/jobs/new', job, {
  cookie: owner.cookie,
  origin: 'https://evil.example',
  forwardedHost: 'evil.example',
});
check(
  'foreign Origin + spoofed X-Forwarded-Host cannot create a job',
  spoofed.status !== 303,
  `got ${spoofed.status}`,
);
check('no jobs were created by rejected requests', (await ownerJobs()) === before);

// --- чужой заказчик и подрядчик
const strangerPage = await fetch(`${WEB}/account/jobs/${id}`, {
  headers: { Cookie: stranger.cookie },
});
check(
  "other customer gets 404 on the owner's job page",
  strangerPage.status === 404,
  `got ${strangerPage.status}`,
);
const strangerPatch = await fetch(`${API}/v1/me/jobs/${id}`, {
  method: 'PATCH',
  headers: { ...stranger.auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Чужая правка заказа' }),
});
check(
  "other customer cannot edit the owner's job (API 404)",
  strangerPatch.status === 404,
  `got ${strangerPatch.status}`,
);
const contractorPage = await (
  await fetch(`${WEB}/account/jobs/new`, { headers: { Cookie: contractor.cookie } })
).text();
check('contractor sees the customers-only page', contractorPage.includes('Раздел для заказчиков'));
const contractorPost = await fetch(`${API}/v1/me/jobs`, {
  method: 'POST',
  headers: { ...contractor.auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...job, budgetMin: null, budgetMax: null }),
});
check(
  'contractor cannot create jobs (API 403)',
  contractorPost.status === 403,
  `got ${contractorPost.status}`,
);

// --- правка и закрытие владельцем через формы
const isEdit = (html) => html.includes('name="title"');
const isClose = (html) => html.includes('Да, закрыть заказ');
const edited = await submit(
  `/account/jobs/${id}`,
  { ...job, title: 'Интеграционный заказ: плитка и сантехника' },
  { cookie: owner.cookie, pick: isEdit },
);
check(
  'owner edits the job -> 303 ?saved=1',
  edited.status === 303 && edited.location?.endsWith('?saved=1'),
  `got ${edited.status}`,
);
const afterEdit = await (await fetch(`${API}/v1/jobs/${id}`)).json();
check('edit is visible publicly', afterEdit.title === 'Интеграционный заказ: плитка и сантехника');

const closed = await submit(`/account/jobs/${id}`, {}, { cookie: owner.cookie, pick: isClose });
check(
  'owner closes the job -> 303 ?closed=1',
  closed.status === 303 && closed.location?.endsWith('?closed=1'),
  `got ${closed.status}`,
);
const afterClose = await (await fetch(`${API}/v1/jobs/${id}`)).json();
check('job is CLOSED publicly', afterClose.status === 'CLOSED');
const editClosed = await fetch(`${API}/v1/me/jobs/${id}`, {
  method: 'PATCH',
  headers: { ...owner.auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Правка закрытого заказа' }),
});
check(
  'closed job cannot be edited (API 409)',
  editClosed.status === 409,
  `got ${editClosed.status}`,
);

finish('jobs integration');
