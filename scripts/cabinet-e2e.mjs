// Пробелы тестов из аудита (docs/AUDIT_FINDINGS.md, TEST-1, 5, 6, 7) в настоящем браузере:
// регистрация, обрыв сети во время автосохранения, пустая выдача поиска, двойной клик по
// «Откликнуться» и «Выбрать», выбор исполнителя через интерфейс, выход в другой вкладке.
// Требует запущенные API и web (production-сборка), как drafts-e2e.
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';

const { check, finish } = createChecker();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const contractor = await registerViaApi('CONTRACTOR');

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const host = new URL(WEB).hostname;
// Регистрация в браузере идёт через web → API: свой адрес, чтобы не делить лимит на вход
// с другими скриптами CI.
const customerContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  extraHTTPHeaders: { 'X-Forwarded-For': `10.251.${process.pid % 250}.7` },
});
const contractorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await contractorContext.addCookies(
  contractor.cookie.split('; ').map((pair) => {
    const [name, value] = pair.split('=');
    return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
  }),
);
const page = await customerContext.newPage();
let customerAuth = {};
const api = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...customerAuth, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

/** Задержка ответов Server Actions: двойной клик успевает до ответа сервера. */
async function slowActions(target, pattern, ms) {
  await target.route(pattern, async (route) => {
    if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
      await sleep(ms);
    }
    await route.continue();
  });
}

try {
  // --- TEST-7: регистрация заказчика в браузере.
  {
    await page.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
    await page.fill('input[name="name"]', 'Браузерный заказчик');
    await page.fill('input[name="email"]', `browser-${Date.now()}@example.ru`);
    await page.fill('input[name="password"]', 'browser-password-123');
    await page.getByText('Я заказчик').click();
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await page.waitForURL(/\/account$/, { timeout: 15_000 });
    const session = (await customerContext.cookies()).find((c) => /ar_session$/.test(c.name));
    customerAuth = { Authorization: `Bearer ${session?.value}` };
    const me = await api('/v1/me');
    check(
      'registration in the browser signs in a customer',
      me.status === 200 && me.body.role === 'CUSTOMER' && me.body.name === 'Браузерный заказчик',
    );
  }

  // --- TEST-1: обрыв сети во время автосохранения черновика.
  {
    await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
    await page.fill('input[name="title"]', 'Обрыв сети: до');
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await page.getByText('Черновик сохранён', { exact: false }).first().waitFor();
    const id = new URL(page.url()).searchParams.get('draft');

    await customerContext.setOffline(true);
    await page.fill('input[name="title"]', 'Обрыв сети: правка без связи');
    await page.getByText('Нет связи', { exact: false }).first().waitFor({ timeout: 15_000 });
    check(
      'offline: the edit stays in the form',
      (await page.inputValue('input[name="title"]')) === 'Обрыв сети: правка без связи',
    );
    await customerContext.setOffline(false);
    await page
      .getByText('Черновик сохранён', { exact: false })
      .first()
      .waitFor({ timeout: 15_000 });
    const draft = (await api(`/v1/me/drafts/${id}`)).body;
    check(
      'back online: the draft is saved without a click',
      draft?.title === 'Обрыв сети: правка без связи',
      draft?.title,
    );
  }

  // --- TEST-7: поиск с пустой выдачей.
  {
    await page.goto(`${WEB}/jobs?q=${encodeURIComponent('несуществующийзапросщщщ')}`, {
      waitUntil: 'networkidle',
    });
    check(
      'empty search says nothing was found',
      await page.getByText('Ничего не нашлось').isVisible(),
    );
  }

  // --- TEST-5: двойной клик по «Откликнуться» даёт один отклик.
  const job = (
    await api('/v1/me/jobs', {
      method: 'POST',
      body: {
        title: 'Браузер: ламинат в детской',
        description: 'Одна комната, около 14 м², ламинат куплен заказчиком.',
        category: 'FLOORING',
        city: 'Москва',
        budgetMin: 15000,
        budgetMax: null,
        details: { covering: 'laminate', area: 14 },
      },
    })
  ).body;
  {
    const bidPage = await contractorContext.newPage();
    await slowActions(bidPage, `**/jobs/${job.id}**`, 1500);
    await bidPage.goto(`${WEB}/jobs/${job.id}`, { waitUntil: 'networkidle' });
    await bidPage.fill('input[name="price"]', '16 000');
    await bidPage.fill('input[name="durationDays"]', '3');
    await bidPage.fill('textarea[name="comment"]', 'Сделаю за три дня, инструмент свой.');
    await bidPage.getByRole('button', { name: 'Откликнуться' }).dblclick();
    await bidPage.waitForURL(/\?bid=sent/, { timeout: 15_000 });
    await sleep(1000);
    const bids = (await api(`/v1/me/jobs/${job.id}/bids`)).body.items;
    check('double click on "respond" leaves one bid', bids.length === 1, `bids ${bids.length}`);
    await bidPage.close();
  }

  // --- TEST-5 и TEST-7: выбор исполнителя через интерфейс, двойной клик по подтверждению.
  {
    await slowActions(page, `**/account/jobs/${job.id}**`, 1500);
    await page.goto(`${WEB}/account/jobs/${job.id}`, { waitUntil: 'networkidle' });
    await page.locator('summary', { hasText: 'Выбрать исполнителем' }).click();
    await page.getByRole('button', { name: /^Да, выбрать/ }).dblclick();
    await page.waitForURL(/\?accepted=1/, { timeout: 15_000 });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const stored = (await api(`/v1/me/jobs/${job.id}`)).body;
    const bids = (await api(`/v1/me/jobs/${job.id}/bids`)).body.items;
    check(
      'accepting in the browser starts the job with one contractor',
      stored.status === 'IN_PROGRESS' && bids.filter((b) => b.status === 'ACCEPTED').length === 1,
    );
    check(
      'customer sees the job in progress',
      await page
        .getByText('Исполнитель выбран, заказ в работе. Составьте план работ вместе с ним.', {
          exact: true,
        })
        .isVisible(),
    );
  }

  // --- TEST-6: выход в одной вкладке, форма в другой не теряет введённое.
  {
    const formTab = await customerContext.newPage();
    await formTab.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
    await formTab.fill('input[name="title"]', 'Вышел в другой вкладке');
    await formTab.fill('textarea[name="description"]', 'Описание остаётся в форме после выхода.');
    const menuTab = await customerContext.newPage();
    await menuTab.goto(`${WEB}/account`, { waitUntil: 'networkidle' });
    // Меню открывается наведением мыши (нажатие при открытом меню закрыло бы его).
    await menuTab.getByRole('button', { name: /^Меню кабинета/ }).hover();
    await menuTab.getByRole('button', { name: 'Выйти', exact: true }).click();
    await menuTab.waitForURL((url) => !url.pathname.startsWith('/account'), { timeout: 15_000 });

    await formTab.getByRole('button', { name: 'Сохранить черновик' }).click();
    await formTab.getByRole('link', { name: 'Войти в новой вкладке' }).first().waitFor();
    check(
      'after logout elsewhere the form keeps its values',
      (await formTab.inputValue('input[name="title"]')) === 'Вышел в другой вкладке' &&
        (await formTab.inputValue('textarea[name="description"]')) ===
          'Описание остаётся в форме после выхода.',
    );
    check('the old session is revoked', (await api('/v1/me')).status === 401);
  }
} catch (error) {
  check('cabinet scenario finished', false, error instanceof Error ? error.message : String(error));
  await page.screenshot({ path: 'cabinet-e2e-failure.png', fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
}

finish('cabinet e2e');
