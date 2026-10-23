/* global document -- выполняется в браузере через page.evaluate */
// «Ход работ» в настоящем браузере двумя пользователями (фаза 2, этапы заказа): исполнитель
// составляет план (ошибка у поля, «Добавить этап»), заказчик возвращает его с комментарием,
// исполнитель правит и отправляет снова, заказчик согласует; этапы по порядку — сдача, доработка,
// повторная сдача, приёмка; второй этап сдаётся без JS; исполнитель отказывается от другого
// заказа — заказ снова открыт. Состояние каждый раз сверяется с API.
// Требует запущенные API и web (production-сборка), как cabinet-e2e.
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const owner = await registerViaApi('CUSTOMER');
const contractor = await registerViaApi('CONTRACTOR');
const other = await registerViaApi('CONTRACTOR');

const api = async (who, path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...who.auth, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const jobBody = {
  title: 'Ход работ: ванная под ключ',
  description: 'Плитка, сантехника, вытяжка. Материалы покупает заказчик.',
  category: 'FLOORING',
  details: { covering: 'laminate', area: 18 },
  city: 'Москва',
};
/** Заказ в работе: исполнитель выбран, у другого подрядчика отклик отклонён. */
async function dealViaApi(title) {
  const created = await api(owner, '/v1/me/jobs', {
    method: 'POST',
    body: { ...jobBody, title },
  });
  if (created.status !== 201)
    throw new Error(`job: ${created.status} ${JSON.stringify(created.body)}`);
  const job = created.body;
  const bid = { price: 90_000, durationDays: 10, comment: 'Сделаю аккуратно, свой инструмент.' };
  const { body: mine } = await api(contractor, `/v1/jobs/${job.id}/bids`, {
    method: 'POST',
    body: bid,
  });
  const { body: theirs } = await api(other, `/v1/jobs/${job.id}/bids`, {
    method: 'POST',
    body: bid,
  });
  const accepted = await api(owner, `/v1/me/jobs/${job.id}/bids/${mine.id}/accept`, {
    method: 'POST',
  });
  if (accepted.status !== 200)
    throw new Error(`accept: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  return { jobId: job.id, otherBidId: theirs.id };
}
const plan = async (jobId) => (await api(owner, `/v1/jobs/${jobId}/plan`)).body;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const cspViolations = watchCsp(browser);
const host = new URL(WEB).hostname;
async function contextFor(who, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ...options });
  await context.addCookies(
    who.cookie.split('; ').map((pair) => {
      const [name, value] = pair.split('=');
      return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
    }),
  );
  return context;
}
const ownerPage = await (await contextFor(owner)).newPage();
const workerPage = await (await contextFor(contractor)).newPage();
const errors = [];
for (const page of [ownerPage, workerPage]) page.on('pageerror', (e) => errors.push(e.message));

/** Раскрыть действие (summary) внутри блока «Ход работ». */
const open = (page, summary, nth = 0) =>
  page.locator('#plan summary', { hasText: summary }).nth(nth).click();

try {
  const { jobId } = await dealViaApi('Ход работ: ванная под ключ');
  const ownerUrl = `${WEB}/account/jobs/${jobId}`;
  const workUrl = `${WEB}/account/work/${jobId}`;

  // --- Исполнитель находит «Ход работ» в своих откликах и составляет план.
  await workerPage.goto(`${WEB}/account/bids`, { waitUntil: 'networkidle' });
  await workerPage.getByRole('link', { name: 'Ход работ', exact: true }).first().click();
  await workerPage.waitForURL(`**/account/work/${jobId}`);
  check(
    'contractor opens the work page from the bids list',
    workerPage.url().endsWith(`/account/work/${jobId}`),
  );
  // Кнопка «Добавить этап» появляется после гидратации, когда лишние строки свёрнуты.
  await workerPage.getByRole('button', { name: 'Добавить этап' }).waitFor();
  const visibleRows = await workerPage.locator('#plan ol > li:not([hidden])').count();
  check('editor shows one empty stage row with JS', visibleRows === 1, `${visibleRows}`);

  await workerPage.fill('input[name="stage-0-title"]', 'ab');
  await workerPage.getByRole('button', { name: 'Отправить на согласование' }).click();
  await workerPage.locator('input[name="stage-0-title"][aria-invalid="true"]').waitFor();
  check(
    'too short title is marked on the field and focused',
    await workerPage.evaluate(
      () => document.activeElement?.getAttribute('name') === 'stage-0-title',
    ),
  );
  await workerPage.fill('input[name="stage-0-title"]', 'Демонтаж');
  await workerPage.fill('input[name="stage-0-durationDays"]', '2');
  await workerPage.getByRole('button', { name: 'Добавить этап' }).click();
  await workerPage.fill('input[name="stage-1-title"]', 'Укладка плитки');
  await workerPage.getByRole('button', { name: 'Отправить на согласование' }).click();
  await workerPage.getByText('План отправлен на согласование.').waitFor();
  let state = await plan(jobId);
  check(
    'plan is proposed with two stages',
    state.status === 'PROPOSED' && state.stages.length === 2,
  );

  // --- Заказчик возвращает план с комментарием.
  await ownerPage.goto(ownerUrl, { waitUntil: 'networkidle' });
  check(
    'owner sees the proposed plan',
    await ownerPage.locator('#plan').getByText('Укладка плитки').isVisible(),
  );
  await open(ownerPage, 'Нужно изменить');
  await ownerPage.fill('#plan textarea[name="reason"]', 'Добавьте срок для плитки');
  await ownerPage.getByRole('button', { name: 'Вернуть план' }).click();
  await ownerPage.getByText('План возвращён с комментарием.').waitFor();
  state = await plan(jobId);
  check(
    'plan is back to draft with the reason',
    state.status === 'DRAFT' && state.returnReason === 'Добавьте срок для плитки',
  );

  // --- Исполнитель видит комментарий, правит и отправляет снова; заказчик согласует.
  await workerPage.goto(workUrl, { waitUntil: 'networkidle' });
  check(
    'contractor sees why the plan was returned',
    await workerPage.getByText('Добавьте срок для плитки').isVisible(),
  );
  await workerPage.fill('input[name="stage-1-durationDays"]', '5');
  await workerPage.getByRole('button', { name: 'Отправить на согласование' }).click();
  await workerPage.getByText('План отправлен на согласование.').waitFor();

  await ownerPage.goto(ownerUrl, { waitUntil: 'networkidle' });
  await open(ownerPage, 'Согласовать план');
  await ownerPage.getByRole('button', { name: 'Да, согласовать' }).click();
  await ownerPage.getByText('План согласован.').waitFor();
  state = await plan(jobId);
  check('plan is approved', state.status === 'APPROVED' && state.stages[1].durationDays === 5);

  // --- Этапы по порядку: сдать можно только первый.
  await workerPage.goto(workUrl, { waitUntil: 'networkidle' });
  const submitButtons = await workerPage.locator('#plan summary', { hasText: 'Этап сдан' }).count();
  check(
    'sequential plan: only the first stage can be submitted',
    submitButtons === 1,
    `${submitButtons}`,
  );
  await open(workerPage, 'Этап сдан');
  await workerPage.fill('#plan textarea[name="comment"]', 'Старая плитка снята, мусор вынесен');
  await workerPage.getByRole('button', { name: 'Сдать этап' }).click();
  await workerPage.getByText('Этап сдан, ждём проверки заказчика.').waitFor();

  // --- Заказчик возвращает на доработку, исполнитель сдаёт снова, заказчик принимает.
  await ownerPage.goto(ownerUrl, { waitUntil: 'networkidle' });
  await open(ownerPage, 'На доработку');
  await ownerPage.fill('#plan textarea[name="comment"]', 'Остался мусор на балконе');
  await ownerPage.getByRole('button', { name: 'Вернуть на доработку' }).click();
  await ownerPage.getByText('Этап возвращён на доработку.').waitFor();
  check('stage is in rework', (await plan(jobId)).stages[0].status === 'REWORK');

  await workerPage.goto(workUrl, { waitUntil: 'networkidle' });
  check(
    'contractor sees what to fix',
    await workerPage.getByText('Остался мусор на балконе').isVisible(),
  );
  await open(workerPage, 'Сдать после доработки');
  await workerPage.fill('#plan textarea[name="comment"]', 'Балкон убран');
  await workerPage.getByRole('button', { name: 'Сдать этап' }).click();
  await workerPage.getByText('Этап сдан, ждём проверки заказчика.').waitFor();

  await ownerPage.goto(ownerUrl, { waitUntil: 'networkidle' });
  await open(ownerPage, 'Принять этап');
  await ownerPage.getByRole('button', { name: 'Да, принять' }).click();
  await ownerPage.getByText('Этап принят.').waitFor();
  check('first stage accepted', (await plan(jobId)).stages[0].status === 'ACCEPTED');

  // --- Второй этап исполнитель сдаёт без JS (форма работает и так).
  {
    const noJs = await (await contextFor(contractor, { javaScriptEnabled: false })).newPage();
    await noJs.goto(workUrl);
    await noJs.locator('#plan summary', { hasText: 'Этап сдан' }).click();
    await noJs.fill('#plan textarea[name="comment"]', 'Плитка уложена, швы затёрты');
    await noJs.getByRole('button', { name: 'Сдать этап' }).click();
    await noJs.waitForLoadState('load');
    check(
      'without JS the stage is submitted',
      (await plan(jobId)).stages[1].status === 'SUBMITTED',
    );
    await noJs.context().close();
  }
  await ownerPage.goto(ownerUrl, { waitUntil: 'networkidle' });
  await open(ownerPage, 'Принять этап');
  await ownerPage.getByRole('button', { name: 'Да, принять' }).click();
  await ownerPage.getByText('Этап принят.').waitFor();
  check(
    'all stages accepted: owner is told to close the job as done',
    await ownerPage.getByText('Все этапы приняты. Закройте заказ как выполненный.').isVisible(),
  );

  // --- Отказ исполнителя от другого заказа.
  {
    const quit = await dealViaApi('Ход работ: отказ исполнителя');
    await workerPage.goto(`${WEB}/account/work/${quit.jobId}`, { waitUntil: 'networkidle' });
    await open(workerPage, 'Отказаться от заказа');
    await workerPage.fill('#plan textarea[name="reason"]', 'Не успеваю по срокам');
    await workerPage.getByRole('button', { name: 'Отказаться от заказа' }).click();
    await workerPage.waitForURL('**/account/bids?quit=1');
    check(
      'quit returns to bids with a notice',
      await workerPage.getByText('Вы отказались от заказа.').isVisible(),
    );
    const { body: job } = await api(owner, `/v1/me/jobs/${quit.jobId}`);
    const bids = (await api(owner, `/v1/me/jobs/${quit.jobId}/bids`)).body.items;
    check(
      'job is open again and the other bid is pending',
      job.status === 'OPEN' && bids.find((b) => b.id === quit.otherBidId)?.status === 'PENDING',
    );
  }

  // Посторонний подрядчик не видит чужой «Ход работ».
  const strangerPage = await (await contextFor(other)).newPage();
  const res = await strangerPage.goto(workUrl);
  check('another contractor gets 404 on the work page', res?.status() === 404, `${res?.status()}`);

  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
} catch (error) {
  check('plan scenario finished', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

checkCsp(check, cspViolations);
finish('plan e2e');
