// Поддержка в настоящем браузере (docs/FEEDBACK.md): обращение из кабинета с адресом страницы,
// «Мои обращения», ответ администратора и ответ у автора — с JS и без. Администратор
// назначается прямо в базе (DATABASE_URL), как в moderation-e2e. Требует запущенные API и web.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { WEB, createChecker, registerViaApi } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const RUN = Date.now().toString(36);
const admin = await registerViaApi('CUSTOMER');
const db = (process.env.DATABASE_URL ?? '').replace(/\?.*$/, '');
execFileSync('psql', [db, '-qc', `UPDATE users SET role = 'ADMIN' WHERE id = '${admin.user.id}'`]);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const cspViolations = watchCsp(browser);
const host = new URL(WEB).hostname;
const contextFor = async (who, options = {}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ...options });
  await context.addCookies(
    who.cookie.split('; ').map((pair) => {
      const [name, value] = pair.split('=');
      return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
    }),
  );
  return context;
};

try {
  for (const [name, options] of [
    ['with JS', {}],
    ['without JS', { javaScriptEnabled: false }],
  ]) {
    const who = await registerViaApi(name === 'with JS' ? 'CUSTOMER' : 'CONTRACTOR');
    const text = `Не открывается фильтр по городу (${name}, ${RUN}).`;

    // Ссылка в подвале несёт адрес страницы, с которой пришли.
    const page = await (await contextFor(who, options)).newPage();
    await page.goto(`${WEB}/jobs`, { waitUntil: 'load' });
    const link = page.getByRole('link', { name: 'Написать в поддержку' });
    check(
      `${name}: the footer link carries the page`,
      (await link.getAttribute('href')) === '/account/feedback?from=%2Fjobs',
      await link.getAttribute('href'),
    );
    await Promise.all([page.waitForURL(/\/account\/feedback/), link.click()]);
    // С JS переход по ссылке — без перезагрузки: ждём, пока форма страницы будет готова.
    await page.waitForLoadState('networkidle');

    // Короткий текст с пробелами проходит проверку браузера (minlength), но не сервера: ошибка
    // у формы, ничего не отправлено.
    await page.getByLabel('Текст обращения').fill('коротко      ');
    await page.getByRole('button', { name: 'Отправить' }).click();
    // Ищем в форме: у Next.js на странице есть и свой служебный элемент с role="alert".
    const formAlert = page.locator('form').getByRole('alert');
    await formAlert.waitFor({ timeout: 10_000 }).catch(() => undefined);
    check(
      `${name}: a too short text is refused next to the form`,
      ((await formAlert.textContent().catch(() => '')) ?? '').includes('не меньше'),
    );

    await page.goto(`${WEB}/account/feedback?from=%2Fjobs`, { waitUntil: 'load' });
    await page.getByLabel(/Идея/).check();
    await page.getByLabel('Текст обращения').fill(text);
    await Promise.all([
      page.waitForURL(/sent=1/, { timeout: 15_000 }),
      page.getByRole('button', { name: 'Отправить' }).click(),
    ]);
    check(`${name}: «sent» is shown`, await page.getByText('Обращение отправлено').isVisible());
    const item = page.locator('li', { hasText: text });
    check(`${name}: the request is in «my requests»`, (await item.count()) === 1);
    check(
      `${name}: it is an idea from /jobs, waiting for a reply`,
      ((await item.textContent()) ?? '').includes('Идея') &&
        ((await item.textContent()) ?? '').includes('страница /jobs') &&
        ((await item.textContent()) ?? '').includes('Ждёт ответа'),
    );

    // Администратор отвечает (в том же режиме JS).
    const adminPage = await (await contextFor(admin, options)).newPage();
    await adminPage.goto(`${WEB}/admin/feedback?status=open`, { waitUntil: 'load' });
    const card = adminPage.locator('li', { hasText: text });
    check(`${name}: the admin sees it in the queue`, (await card.count()) === 1);
    await card.getByLabel('Ответ').fill('Спасибо! Исправим в ближайшем обновлении.');
    await card.getByRole('button', { name: 'Ответить' }).click();
    // После ответа страница очереди обновляется, и обращение уходит из «Без ответа».
    await card.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
    await adminPage.goto(`${WEB}/admin/feedback?status=answered`, { waitUntil: 'load' });
    check(
      `${name}: the reply is saved`,
      (await adminPage.locator('li', { hasText: text }).textContent())?.includes(
        'Исправим в ближайшем обновлении',
      ) === true,
    );

    // Автор узнаёт об ответе: строка на странице уведомлений.
    await page.goto(`${WEB}/account/notifications`, { waitUntil: 'load' });
    check(
      `${name}: notifications say support replied`,
      await page.getByText('Поддержка ответила на ваши обращения').isVisible(),
    );

    // Пометка — в первой отрисовке с сервера: с JS страница сразу отмечает ответ просмотренным
    // и перерисовывается уже без неё.
    const first = await (await page.goto(`${WEB}/account/feedback`, { waitUntil: 'load' })).text();
    check(`${name}: the reply is marked new on opening`, first.includes('Новый ответ'));
    await page.waitForLoadState('networkidle');
    const answered = page.locator('li', { hasText: text });
    check(
      `${name}: the author sees the reply`,
      ((await answered.textContent()) ?? '').includes('Ответ поддержки') &&
        ((await answered.textContent()) ?? '').includes('Исправим в ближайшем обновлении'),
    );

    // С JS ответ отмечается просмотренным при открытии страницы, без JS — кнопкой «Отметить все
    // прочитанными» на странице уведомлений.
    await page.goto(`${WEB}/account/notifications`, { waitUntil: 'load' });
    if (name === 'without JS') {
      await Promise.all([
        page.waitForURL(/read=1/, { timeout: 15_000 }),
        page.getByRole('button', { name: 'Отметить все прочитанными' }).click(),
      ]);
    }
    check(
      `${name}: after that the reply is no longer new`,
      (await page.getByText('Поддержка ответила на ваши обращения').count()) === 0,
    );
  }

  // Другой человек чужих обращений не видит.
  const stranger = await registerViaApi('CUSTOMER');
  const strangerPage = await (await contextFor(stranger)).newPage();
  await strangerPage.goto(`${WEB}/account/feedback`, { waitUntil: 'load' });
  check(
    'another person does not see these requests',
    (await strangerPage.getByText(RUN).count()) === 0 &&
      (await strangerPage.getByText('Обращений пока нет').isVisible()),
  );
  checkCsp(check, cspViolations);
} finally {
  await browser.close();
}
finish('feedback e2e');
