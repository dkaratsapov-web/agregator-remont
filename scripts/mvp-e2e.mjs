// Сценарии MVP из аудита (docs/AUDIT_FINDINGS.md, MVP-1…6) в настоящем браузере:
// повтор публикации, правка в двух вкладках, черновик в двух вкладках, истёкшая сессия посреди
// формы, пометка откликов после правки заказа, исход закрытия.
// Требует запущенные API и web (production-сборка), как drafts-e2e.
import { chromium } from 'playwright';
import { API, WEB, actionForm, createChecker, registerViaApi } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const customer = await registerViaApi('CUSTOMER');
const contractor = await registerViaApi('CONTRACTOR');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const api = async (path, user, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...user.auth, 'Content-Type': 'application/json', ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};
const jobsTotal = async () => (await api('/v1/me/jobs?limit=1', customer)).body.total;
const drafts = async () => (await api('/v1/me/drafts', customer)).body.items;
const createJob = async (title) =>
  (
    await api('/v1/me/jobs', customer, {
      method: 'POST',
      body: {
        title,
        description: 'Две комнаты, около 40 м², ламинат куплен заказчиком.',
        category: 'FLOORING',
        city: 'Гатчина',
        budgetMin: 30000,
        budgetMax: 45000,
        details: { covering: 'laminate', area: 40 },
      },
    })
  ).body;
const placeBid = async (jobId) =>
  (
    await api(`/v1/jobs/${jobId}/bids`, contractor, {
      method: 'POST',
      body: { price: 38000, durationDays: 4, comment: 'Сделаю за 4 дня, свой инструмент.' },
    })
  ).body;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const cspViolations = watchCsp(browser);
const host = new URL(WEB).hostname;
const cookiesOf = (user) =>
  user.cookie.split('; ').map((pair) => {
    const [name, value] = pair.split('=');
    return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
  });
async function contextFor(user) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(cookiesOf(user));
  return context;
}
const customerContext = await contextFor(customer);
const contractorContext = await contextFor(contractor);
const page = await customerContext.newPage();

/** Заполняет форму до публикуемого состояния: категория «Другое» и её обязательные вопросы. */
async function fillValidJob(target, title) {
  await target.fill('input[name="title"]', title);
  await target.click('#field-category');
  await target.getByRole('option', { name: 'Другое' }).click();
  await target.fill('#field-city', 'Москва');
  await target.getByRole('option', { name: 'Москва', exact: true }).click();
  await target.fill('textarea[name="description"]', 'Повесить полки и карниз, всё на месте.');
  for (const group of await target.locator('[role="radiogroup"], [role="group"]').all()) {
    const required = await group.evaluate((el) =>
      Boolean(el.closest('[id^="q-"]')?.textContent?.includes('обязательно')),
    );
    if (required) await group.locator('button, [role="radio"], [role="checkbox"]').first().click();
  }
}

try {
  // --- MVP-1: один и тот же запрос публикации дважды (повтор после обрыва связи, двойная
  // отправка без JavaScript) создаёт один заказ.
  {
    const isJobForm = (html) => html.includes('name="requestId"');
    const fields = await actionForm('/account/jobs/new', {
      cookie: customer.cookie,
      pick: isJobForm,
    });
    const requestId = fields.find(([name]) => name === 'requestId')?.[1];
    check('new job form carries a publish key', /^[0-9a-f-]{36}$/.test(requestId ?? ''));
    const body = () => {
      const form = new FormData();
      for (const [name, value] of fields) form.append(name, value);
      for (const [name, value] of Object.entries({
        title: 'Повтор: ламинат в гостиной',
        category: 'FLOORING',
        city: 'Москва',
        description: 'Одна комната, около 20 м², ламинат куплен заказчиком.',
        budgetMin: '',
        budgetMax: '',
        details: JSON.stringify({ covering: 'laminate', area: 20 }),
        extraItems: '[]',
      }))
        form.set(name, value);
      return form;
    };
    const before = await jobsTotal();
    const post = () =>
      fetch(`${WEB}/account/jobs/new`, {
        method: 'POST',
        body: body(),
        headers: { Origin: WEB, Cookie: customer.cookie },
        redirect: 'manual',
      });
    const [first, second] = await Promise.all([post(), post()]);
    const third = await post();
    const locations = [first, second, third].map((r) => r.headers.get('location'));
    check(
      'repeated publish with one key -> one job',
      (await jobsTotal()) === before + 1,
      `jobs ${before} -> ${await jobsTotal()}`,
    );
    check(
      'every repeat lands on the same job',
      locations.every((l) => l && l === locations[0]),
      locations.join(', '),
    );
  }

  // --- MVP-1 в браузере: двойной клик по «Опубликовать» при медленной сети.
  {
    await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
    await fillValidJob(page, 'Двойной клик: карниз');
    const before = await jobsTotal();
    const slow = async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        await sleep(1500);
      }
      await route.continue();
    };
    await page.route('**/account/jobs/new**', slow);
    await page.getByRole('button', { name: 'Опубликовать заказ' }).dblclick();
    await page.waitForURL(/\/account\/jobs\/[^/?]+\?created=1/, { timeout: 20_000 });
    await page.unroute('**/account/jobs/new**', slow);
    await sleep(1500);
    check(
      'double click publishes one job',
      (await jobsTotal()) === before + 1,
      `jobs ${before} -> ${await jobsTotal()}`,
    );
  }

  // --- MVP-2: правка одного заказа в двух вкладках.
  {
    const job = await createJob('Две вкладки: ламинат');
    const tab1 = await customerContext.newPage();
    const tab2 = await customerContext.newPage();
    await tab1.goto(`${WEB}/account/jobs/${job.id}`, { waitUntil: 'networkidle' });
    await tab2.goto(`${WEB}/account/jobs/${job.id}`, { waitUntil: 'networkidle' });
    await tab1.fill('input[name="title"]', 'Две вкладки: правка первой');
    await tab1.getByRole('button', { name: 'Сохранить изменения' }).click();
    await tab1.waitForURL(/\?saved=1/);
    const typed = 'Правка из второй вкладки: три комнаты и коридор, около 55 м².';
    await tab2.fill('textarea[name="description"]', typed);
    await tab2.getByRole('button', { name: 'Сохранить изменения' }).click();
    await tab2.getByText('изменён в другой вкладке', { exact: false }).first().waitFor();
    const stored = (await api(`/v1/me/jobs/${job.id}`, customer)).body;
    check(
      'stale tab does not overwrite the other tab',
      stored.title === 'Две вкладки: правка первой' && stored.description === job.description,
    );
    check(
      'stale tab keeps what was typed',
      (await tab2.inputValue('textarea[name="description"]')) === typed,
    );
    await tab1.close();
    await tab2.close();
  }

  // --- MVP-6: черновик в двух вкладках.
  {
    const tab1 = await customerContext.newPage();
    await tab1.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
    await tab1.fill('input[name="title"]', 'Черновик: вкладка 1');
    await tab1.getByRole('button', { name: 'Сохранить черновик' }).click();
    await tab1.getByText('Черновик сохранён', { exact: false }).first().waitFor();
    const url = tab1.url();
    const id = new URL(url).searchParams.get('draft');
    const tab2 = await customerContext.newPage();
    await tab2.goto(url, { waitUntil: 'networkidle' });
    await tab2.fill('input[name="title"]', 'Черновик: вкладка 2');
    await tab2.getByRole('button', { name: 'Сохранить черновик' }).click();
    await tab2.getByText('Черновик сохранён', { exact: false }).first().waitFor();

    await tab1.fill('input[name="title"]', 'Черновик: вкладка 1, вторая правка');
    await tab1.getByRole('button', { name: 'Сохранить черновик' }).click();
    await tab1.getByRole('button', { name: 'Оставить мою версию' }).waitFor();
    const draftTitle = async () => (await drafts()).find((d) => d.id === id)?.title;
    check('older tab does not overwrite the draft', (await draftTitle()) === 'Черновик: вкладка 2');

    await tab1.getByRole('button', { name: 'Оставить мою версию' }).click();
    await tab1.getByText('Черновик сохранён', { exact: false }).first().waitFor();
    check(
      '"keep mine" saves this tab over the other',
      (await draftTitle()) === 'Черновик: вкладка 1, вторая правка',
    );

    await tab2.fill('input[name="title"]', 'Черновик: вкладка 2, опоздала');
    await tab2.getByRole('button', { name: 'Сохранить черновик' }).click();
    await tab2.getByRole('button', { name: 'Открыть сохранённую' }).click();
    await tab2.waitForLoadState('networkidle');
    check(
      '"open saved" shows the latest saved draft',
      (await tab2.inputValue('input[name="title"]')) === 'Черновик: вкладка 1, вторая правка',
    );
    await tab1.close();
    await tab2.close();
  }

  // --- MVP-4: сессия закончилась посреди формы нового заказа.
  {
    await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
    await fillValidJob(page, 'Сессия кончилась: зеркало');
    await customerContext.clearCookies();
    const before = await jobsTotal();
    await page.getByRole('button', { name: 'Опубликовать заказ' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Сессия закончилась' }).first();
    await alert.waitFor();
    const link = alert.getByRole('link', { name: 'Войти в новой вкладке' });
    check(
      'expired session: login link opens in a new tab',
      (await link.getAttribute('target')) === '_blank' &&
        (await link.getAttribute('href'))?.startsWith('/login?next=%2Faccount%2Fjobs%2Fnew'),
    );
    check(
      'expired session: typed values stay in the form',
      (await page.inputValue('input[name="title"]')) === 'Сессия кончилась: зеркало' &&
        new URL(page.url()).pathname === '/account/jobs/new',
    );
    // Человек вошёл в другой вкладке и отправляет форму ещё раз.
    await customerContext.addCookies(cookiesOf(customer));
    await page.getByRole('button', { name: 'Опубликовать заказ' }).click();
    await page.waitForURL(/\/account\/jobs\/[^/?]+\?created=1/, { timeout: 15_000 });
    check('after login the same form publishes', (await jobsTotal()) === before + 1);
  }

  // --- MVP-3: пометка откликов после правки заказа; MVP-5: исход закрытия.
  {
    const changed = await createJob('Пометка: ламинат в спальне');
    await placeBid(changed.id);
    await page.goto(`${WEB}/account/jobs/${changed.id}`, { waitUntil: 'networkidle' });
    await page.fill('input[name="budgetMax"]', '50 000');
    await page.getByRole('button', { name: 'Сохранить изменения' }).click();
    await page.waitForURL(/\?saved=1/);
    check(
      'customer sees the bid was given before the change',
      await page.getByText('Отклик дан до изменения заказа', { exact: false }).isVisible(),
    );
    const bidsPage = await contractorContext.newPage();
    await bidsPage.goto(`${WEB}/account/bids`, { waitUntil: 'networkidle' });
    check(
      'contractor sees the job changed after the bid',
      await bidsPage.getByText('Заказ изменён после вашего отклика', { exact: false }).isVisible(),
    );

    // Заказ в работе закрывают как выполненный.
    const done = await createJob('Исход: выполнен');
    const bid = await placeBid(done.id);
    await api(`/v1/me/jobs/${done.id}/bids/${bid.id}/accept`, customer, { method: 'POST' });
    await page.goto(`${WEB}/account/jobs/${done.id}`, { waitUntil: 'networkidle' });
    await page.locator('summary', { hasText: 'Закрыть заказ' }).click();
    await page.getByRole('radio', { name: /Работы выполнены/ }).check();
    // Только форма закрытия: на странице заказа в работе есть и формы «Хода работ».
    await page
      .locator('details', { has: page.locator('summary', { hasText: 'Закрыть заказ' }) })
      .locator('form button[type="submit"]')
      .click();
    await page.waitForURL(/\?closed=done/);
    check(
      'job in progress is closed as completed',
      (await api(`/v1/me/jobs/${done.id}`, customer)).body.closeOutcome === 'COMPLETED',
    );

    // Заказ без исполнителя можно только отменить; ожидающий отклик отклонён с причиной.
    const cancelled = await createJob('Исход: отменён');
    await placeBid(cancelled.id);
    await page.goto(`${WEB}/account/jobs/${cancelled.id}`, { waitUntil: 'networkidle' });
    check(
      'open job offers cancel only',
      (await page.locator('summary', { hasText: 'Отменить заказ' }).count()) === 1 &&
        (await page.getByRole('radio', { name: /Работы выполнены/ }).count()) === 0,
    );
    await page.locator('summary', { hasText: 'Отменить заказ' }).click();
    await page.getByRole('button', { name: 'Да, отменить заказ' }).click();
    await page.waitForURL(/\?closed=cancelled/);

    await bidsPage.reload({ waitUntil: 'networkidle' });
    const row = (title) => bidsPage.locator('li', { hasText: title });
    check(
      'contractor sees the completed outcome',
      (await row('Исход: выполнен').textContent())?.includes('заказ выполнен'),
    );
    check(
      'contractor sees why the bid was rejected',
      (await row('Исход: отменён').textContent())?.includes('Заказ закрыт'),
    );
    await bidsPage.close();
  }
} catch (error) {
  check('mvp scenario finished', false, error instanceof Error ? error.message : String(error));
  await page.screenshot({ path: 'mvp-e2e-failure.png', fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
}

checkCsp(check, cspViolations);
finish('mvp e2e');
