// Интеграционный тест откликов: web → API на production-сборке, без моков.
import { API, WEB, createChecker, registerViaApi, submit } from './lib/forms.mjs';

const { check, finish } = createChecker();
const getJson = async (path, auth) => (await fetch(API + path, { headers: auth })).json();

const customer = await registerViaApi('CUSTOMER');
const stranger = await registerViaApi('CUSTOMER');
const contractorA = await registerViaApi('CONTRACTOR');
const contractorB = await registerViaApi('CONTRACTOR');

// Заказ заказчика (через API, формы заказов проверяет jobs-integration).
const jobRes = await fetch(`${API}/v1/me/jobs`, {
  method: 'POST',
  headers: { ...customer.auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Интеграция: укладка ламината',
    description: 'Две комнаты, около 40 м², ламинат куплен заказчиком.',
    category: 'FLOORING',
    city: 'Гатчина',
    budgetMin: 30000,
    budgetMax: 45000,
  }),
});
const job = await jobRes.json();
check('customer job created', jobRes.status === 201, `got ${jobRes.status}`);

// --- профиль подрядчика через форму
const profile = await submit(
  '/account/profile',
  {
    about: 'Полы и отделка, без предоплаты.',
    categories: 'FLOORING',
    cities: 'Казань, Самара',
    experienceYears: '9',
  },
  { cookie: contractorA.cookie },
);
check(
  'contractor saves profile via form -> 303',
  profile.status === 303 && profile.location?.endsWith('?saved=1'),
  `got ${profile.status}`,
);
const savedProfile = await getJson('/v1/me/profile', contractorA.auth);
check(
  'profile stored with parsed cities',
  JSON.stringify(savedProfile.cities) === JSON.stringify(['Казань', 'Самара']),
);

// --- отклики через форму на странице заказа
const isBidForm = (html) => html.includes('name="price"');
const bidFields = {
  price: '38 000',
  durationDays: '4',
  comment: 'Сделаю за 4 дня, свой инструмент.',
};
const bidA = await submit(`/jobs/${job.id}`, bidFields, {
  cookie: contractorA.cookie,
  pick: isBidForm,
});
check(
  'contractor A bids via form -> 303 ?bid=sent',
  bidA.status === 303 && bidA.location?.endsWith('?bid=sent'),
  `got ${bidA.status}`,
);
const bidB = await submit(
  `/jobs/${job.id}`,
  { ...bidFields, price: '41 000' },
  { cookie: contractorB.cookie, pick: isBidForm },
);
check('contractor B bids via form -> 303', bidB.status === 303, `got ${bidB.status}`);

const dupApi = await fetch(`${API}/v1/jobs/${job.id}/bids`, {
  method: 'POST',
  headers: { ...contractorA.auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ price: 1000, comment: 'Повторный отклик на заказ' }),
});
check('second bid on the same job -> 409', dupApi.status === 409, `got ${dupApi.status}`);

const customerJobPage = await (
  await fetch(`${WEB}/jobs/${job.id}`, { headers: { Cookie: stranger.cookie } })
).text();
check('a customer sees no bid form on a job page', !customerJobPage.includes('name="price"'));

const customerBidApi = await fetch(`${API}/v1/jobs/${job.id}/bids`, {
  method: 'POST',
  headers: { ...customer.auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ price: 1000, comment: 'Заказчик пробует откликнуться' }),
});
check(
  'customer cannot bid (API 403)',
  customerBidApi.status === 403,
  `got ${customerBidApi.status}`,
);

// --- видимость
const mineA = await getJson('/v1/me/bids', contractorA.auth);
check('contractor A sees only own bid', mineA.total === 1 && mineA.items[0].price === 38000);
const strangerBids = await fetch(`${API}/v1/me/jobs/${job.id}/bids`, { headers: stranger.auth });
check(
  'other customer cannot list bids (404)',
  strangerBids.status === 404,
  `got ${strangerBids.status}`,
);
const ownerPage = await (
  await fetch(`${WEB}/account/jobs/${job.id}`, { headers: { Cookie: customer.cookie } })
).text();
check(
  'owner sees both bids on the job page',
  ownerPage.includes('38 000') || ownerPage.includes('38 000'),
);
check(
  'owner page does not show contractor emails',
  !ownerPage.includes(contractorA.user.email) && !ownerPage.includes(contractorB.user.email),
);
const strangerPage = await fetch(`${WEB}/account/jobs/${job.id}`, {
  headers: { Cookie: stranger.cookie },
});
check(
  'other customer gets 404 on the owner job page',
  strangerPage.status === 404,
  `got ${strangerPage.status}`,
);

// --- выбор исполнителя через форму (CSRF и владение)
const ownerBids = await getJson(`/v1/me/jobs/${job.id}/bids`, customer.auth);
const bidAId = ownerBids.find((b) => b.price === 38000).id;
const isAcceptA = (html) => html.includes('Да, выбрать') && html.includes('$ACTION');
const forged = await submit(
  `/account/jobs/${job.id}`,
  {},
  {
    cookie: customer.cookie,
    origin: 'https://evil.example',
    forwardedHost: 'evil.example',
    pick: isAcceptA,
  },
);
check(
  'foreign Origin + spoofed X-Forwarded-Host cannot accept a bid',
  forged.status !== 303,
  `got ${forged.status}`,
);
check(
  'job still open after forged accept',
  (await getJson(`/v1/jobs/${job.id}`)).status === 'OPEN',
);

const accepted = await submit(
  `/account/jobs/${job.id}`,
  {},
  { cookie: customer.cookie, pick: isAcceptA },
);
check(
  'owner accepts a bid via form -> 303 ?accepted=1',
  accepted.status === 303 && accepted.location?.endsWith('?accepted=1'),
  `got ${accepted.status}`,
);
const afterAccept = await getJson(`/v1/me/jobs/${job.id}/bids`, customer.auth);
const statuses = Object.fromEntries(afterAccept.map((b) => [b.price, b.status]));
check(
  'chosen bid ACCEPTED, the other REJECTED',
  statuses[38000] === 'ACCEPTED' && statuses[41000] === 'REJECTED',
  JSON.stringify(statuses),
);
check(
  'job is IN_PROGRESS publicly',
  (await getJson(`/v1/jobs/${job.id}`)).status === 'IN_PROGRESS',
);
const mineB = await getJson('/v1/me/bids', contractorB.auth);
check('contractor B sees own bid rejected', mineB.items[0]?.status === 'REJECTED');
check(
  'accepted bid id matches',
  afterAccept.some((b) => b.id === bidAId && b.status === 'ACCEPTED'),
);

finish('bids integration');
