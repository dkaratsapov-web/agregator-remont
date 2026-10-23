/* global document, window -- выполняется в браузере через evaluate */
// Уведомления в кабинете в настоящем браузере (фаза 2): колокольчик с числом непрочитанных,
// пометка «Новое» в списках заказов и откликов, страница уведомлений, прочтение при открытии
// заказа, «Отметить все прочитанными», работа без JS, 320 px. Состояние сверяется с API.
// Требует запущенные API и web (production-сборка), как chat-e2e.
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const owner = await registerViaApi('CUSTOMER');
const contractor = await registerViaApi('CONTRACTOR');
const stranger = await registerViaApi('CUSTOMER');

const api = async (who, path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...who.auth, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const unread = async (who) => (await api(who, '/v1/me/notifications/summary')).body.unread;

async function openJob(title) {
  const { body: job } = await api(owner, '/v1/me/jobs', {
    method: 'POST',
    body: {
      title,
      description: 'Заменить смеситель и сифон на кухне, проверить подводку.',
      category: 'FLOORING',
      details: { covering: 'laminate', area: 12 },
      city: 'Москва',
    },
  });
  return job.id;
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const cspViolations = watchCsp(browser);
const host = new URL(WEB).hostname;
async function contextFor(who, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  await context.addCookies(
    who.cookie.split('; ').map((pair) => {
      const [name, value] = pair.split('=');
      return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
    }),
  );
  return context;
}
const errors = [];
const watch = (page) => page.on('pageerror', (e) => errors.push(e.message));
const bell = (page) => page.locator('header a[href="/account/notifications"]').first();

/** Ждать, пока выполнится условие в API (прочтение идёт из браузера в фоне). */
async function until(condition, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

try {
  const jobId = await openJob('Уведомления: смеситель на кухне');
  const ownerPage = await (await contextFor(owner)).newPage();
  const workerPage = await (await contextFor(contractor)).newPage();
  watch(ownerPage);
  watch(workerPage);

  // --- Новый отклик: у заказчика колокольчик с числом и пометка в «Моих заказах».
  const { body: bid } = await api(contractor, `/v1/jobs/${jobId}/bids`, {
    method: 'POST',
    body: { price: 7_500, durationDays: 1, comment: 'Заменю за один день, смеситель ваш.' },
  });
  await ownerPage.goto(`${WEB}/account/jobs`, { waitUntil: 'networkidle' });
  check(
    'owner: bell shows one unread',
    (await bell(ownerPage).getAttribute('aria-label')) === 'Уведомления: непрочитанных 1',
    await bell(ownerPage).getAttribute('aria-label'),
  );
  check(
    'owner: the job row is marked «Новое»',
    await ownerPage
      .locator('li', { hasText: 'Уведомления: смеситель на кухне' })
      .getByText('Новое')
      .isVisible(),
  );

  // --- Страница уведомлений: текст отклика с ценой; переход ведёт к откликам заказа, и
  // уведомление становится прочитанным, число в шапке пропадает.
  await ownerPage.goto(`${WEB}/account/notifications`, { waitUntil: 'networkidle' });
  const item = ownerPage.getByRole('link', { name: /Новый отклик/ });
  check(
    'notifications page lists the bid with price and job',
    (await item.textContent()).includes('7 500 ₽, срок 1 день') &&
      (await item.textContent()).includes('Уведомления: смеситель на кухне'),
    await item.textContent(),
  );
  await item.click();
  await ownerPage.waitForURL(`**/account/jobs/${jobId}#bids`);
  check('opening the job marks it read', await until(async () => (await unread(owner)) === 0));
  await ownerPage.waitForFunction(
    () =>
      document
        .querySelector('header a[href="/account/notifications"]')
        ?.getAttribute('aria-label') === 'Уведомления',
  );
  check('bell clears after the job is opened', true);

  // --- Выбор исполнителя: у исполнителя — уведомление, пометка в «Моих откликах», прочтение на
  // «Ходе работ».
  await api(owner, `/v1/me/jobs/${jobId}/bids/${bid.id}/accept`, { method: 'POST' });
  await workerPage.goto(`${WEB}/account/bids`, { waitUntil: 'networkidle' });
  check(
    'contractor: the bid is marked «Новое»',
    await workerPage
      .locator('li', { hasText: 'Уведомления: смеситель на кухне' })
      .getByText('Новое')
      .isVisible(),
  );
  await workerPage.goto(`${WEB}/account/work/${jobId}`, { waitUntil: 'networkidle' });
  check(
    'contractor: opening «Ход работ» marks it read',
    await until(async () => (await unread(contractor)) === 0),
  );

  // --- Новое сообщение, пока «Ход работ» открыт: переписка обновляется сама, уведомление
  // сразу становится прочитанным.
  await api(owner, `/v1/jobs/${jobId}/messages`, {
    method: 'POST',
    body: { body: 'Смеситель уже купил, жду вас.' },
  });
  await workerPage
    .locator('#chat li', { hasText: 'Смеситель уже купил' })
    .waitFor({ timeout: 30_000 });
  check(
    'message seen on an open work page is marked read',
    await until(async () => (await unread(contractor)) === 0),
  );

  // --- «Отметить все прочитанными».
  const second = await openJob('Уведомления: второй заказ');
  const third = await openJob('Уведомления: третий заказ');
  for (const id of [second, third]) {
    await api(contractor, `/v1/jobs/${id}/bids`, {
      method: 'POST',
      body: { price: 5_000, durationDays: 2, comment: 'Возьмусь, есть свободные дни.' },
    });
  }
  await ownerPage.goto(`${WEB}/account/notifications`, { waitUntil: 'networkidle' });
  await ownerPage.getByRole('button', { name: 'Отметить все прочитанными' }).click();
  await ownerPage.getByText('Все уведомления отмечены прочитанными.').waitFor();
  check('mark all read empties the counter', (await unread(owner)) === 0);
  check(
    'the button disappears when nothing is unread',
    (await ownerPage.getByRole('button', { name: 'Отметить все прочитанными' }).count()) === 0,
  );

  // --- Без JS: список виден, ссылки работают, «Отметить все» отправляется формой.
  {
    const fourth = await openJob('Уведомления: без JavaScript');
    await api(contractor, `/v1/jobs/${fourth}/bids`, {
      method: 'POST',
      body: { price: 3_000, durationDays: 1, comment: 'Сделаю быстро и аккуратно.' },
    });
    const noJs = await (await contextFor(owner, { javaScriptEnabled: false })).newPage();
    await noJs.goto(`${WEB}/account/notifications`);
    check(
      'without JS the list renders',
      await noJs
        .getByRole('link', { name: /Новый отклик/ })
        .first()
        .isVisible(),
    );
    await noJs.getByRole('button', { name: 'Отметить все прочитанными' }).click();
    await noJs.waitForLoadState('load');
    check('without JS mark all read works', (await unread(owner)) === 0);
    await noJs.context().close();
  }

  // --- Посторонний: пусто; 320 px без горизонтальной прокрутки.
  {
    const page = await (
      await contextFor(stranger, { viewport: { width: 320, height: 700 } })
    ).newPage();
    await page.goto(`${WEB}/account/notifications`, { waitUntil: 'networkidle' });
    check(
      'a stranger sees no notifications',
      await page.getByText('Уведомлений пока нет').isVisible(),
    );
    const [scroll, inner] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    check('320 px: notifications page fits', scroll <= inner, `${scroll} > ${inner}`);
    await page.context().close();
  }

  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
} catch (error) {
  check(
    'notifications scenario finished',
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  await browser.close();
}

checkCsp(check, cspViolations);
finish('notifications e2e');
