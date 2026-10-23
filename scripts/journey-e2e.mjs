/* global document, window -- выполняется в браузере через evaluate */
// Сквозной путь двух людей в настоящем браузере на телефоне (390×844, касания) (ТЗ #42, п. 7):
// регистрация заказчика → анкета заказа → автосохранённый черновик → после перезагрузки на месте
// → публикация → регистрация подрядчика → отклик только с клавиатуры → выбор исполнителя →
// закрытие с исходом «выполнено». Каждый шаг сверяется с API. Затем все пройденные страницы
// открываются на 320, 390 и 768 px: без горизонтальной прокрутки и ошибок JS.
// Истёкшая сессия посреди формы — mvp-e2e.mjs, обрыв сети — cabinet-e2e.mjs.
// Требует запущенные API и web (production-сборка), как cabinet-e2e.
import { chromium } from 'playwright';
import { API, WEB, createChecker } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const stamp = Date.now();
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const cspViolations = watchCsp(browser);
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const customerContext = await browser.newContext(phone);
const contractorContext = await browser.newContext(phone);
const errors = [];
const visited = [];

async function open(context) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('load', () => {
    const { pathname, search } = new URL(page.url());
    visited.push({ context, path: pathname + search });
  });
  return page;
}

/** Токен сессии из cookie браузера — для сверки шагов с API. */
async function apiAs(context, path) {
  const session = (await context.cookies()).find((c) => /ar_session$/.test(c.name));
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${session?.value}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function register(page, role, name) {
  await page.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="email"]', `journey-${role}-${stamp}@example.ru`);
  await page.fill('input[name="password"]', 'journey-password-123');
  await page.getByText(role === 'CUSTOMER' ? 'Я заказчик' : 'Я подрядчик').click();
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await page.waitForURL(/\/account$/, { timeout: 15_000 });
}

const customer = await open(customerContext);
const contractor = await open(contractorContext);
const title = `Путь: полки и карниз ${stamp}`;

try {
  // --- Заказчик: регистрация, анкета, черновик, публикация.
  await register(customer, 'CUSTOMER', 'Заказчик пути');
  check('customer registered', (await apiAs(customerContext, '/v1/me')).body?.role === 'CUSTOMER');

  await customer.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
  await customer.fill('input[name="title"]', title);
  await customer.click('#field-category');
  await customer.getByRole('option', { name: 'Другое' }).click();
  await customer.fill('#field-city', 'Москва');
  await customer.getByRole('option', { name: 'Москва', exact: true }).click();
  await customer.fill('textarea[name="description"]', 'Повесить две полки и карниз, всё куплено.');
  // Анкета категории: в каждом обязательном вопросе — первый вариант.
  let answered = 0;
  for (const group of await customer.locator('[role="radiogroup"], [role="group"]').all()) {
    const required = await group.evaluate((el) =>
      Boolean(el.closest('[id^="q-"]')?.textContent?.includes('обязательно')),
    );
    if (!required) continue;
    await group.locator('button, [role="radio"], [role="checkbox"]').first().click();
    answered += 1;
  }
  check('questionnaire has required questions and they are answered', answered > 0, `${answered}`);
  await customer
    .getByText('Черновик сохранён', { exact: false })
    .first()
    .waitFor({ timeout: 20_000 });
  const draftId = new URL(customer.url()).searchParams.get('draft');
  const draft = (await apiAs(customerContext, `/v1/me/drafts/${draftId}`)).body;
  check('autosave keeps the questionnaire in a draft', draft?.title === title, draft?.title);

  await customer.reload({ waitUntil: 'networkidle' });
  check(
    'after reload the form continues the draft',
    (await customer.inputValue('input[name="title"]')) === title,
  );
  await customer.getByRole('button', { name: 'Опубликовать заказ' }).click();
  await customer.waitForURL(/\/account\/jobs\/[^/?]+\?created=1/, { timeout: 15_000 });
  const jobId = new URL(customer.url()).pathname.split('/').pop();
  const job = (await apiAs(customerContext, `/v1/me/jobs/${jobId}`)).body;
  check('published job is open and the draft is gone', job?.status === 'OPEN');
  check(
    'no drafts left',
    ((await apiAs(customerContext, '/v1/me/drafts')).body?.items ?? []).length === 0,
  );

  // --- Подрядчик: регистрация, заказ в каталоге, отклик только с клавиатуры.
  await register(contractor, 'CONTRACTOR', 'Подрядчик пути');
  await contractor.goto(`${WEB}/jobs?q=${encodeURIComponent(title)}`, {
    waitUntil: 'networkidle',
  });
  await contractor.getByRole('link', { name: title }).first().click();
  await contractor.waitForURL(`**/jobs/${jobId}`);
  await contractor.focus('input[name="price"]');
  await contractor.keyboard.type('12000');
  await contractor.keyboard.press('Tab');
  check(
    'Tab moves from price to the term',
    await contractor.evaluate(
      () => document.activeElement?.getAttribute('name') === 'durationDays',
    ),
  );
  await contractor.keyboard.type('2');
  await contractor.keyboard.press('Tab');
  await contractor.keyboard.type('Сделаю за два дня, крепёж свой.');
  // Дальше Tab до кнопки отправки и Enter: форма отправляется без мыши.
  for (let i = 0; i < 10; i += 1) {
    await contractor.keyboard.press('Tab');
    const onSubmit = await contractor.evaluate(
      () => document.activeElement?.textContent?.trim() === 'Откликнуться',
    );
    if (onSubmit) break;
  }
  const focusVisible = await contractor.evaluate(() => {
    const el = document.activeElement;
    if (!el || !el.matches(':focus-visible')) return false;
    const style = window.getComputedStyle(el);
    return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
  });
  check('submit button reached by Tab has a visible focus ring', focusVisible);
  await contractor.keyboard.press('Enter');
  await contractor.waitForURL(/\?bid=sent/, { timeout: 15_000 });
  const bids = (await apiAs(customerContext, `/v1/me/jobs/${jobId}/bids`)).body?.items ?? [];
  check('bid sent with the keyboard only', bids.length === 1 && bids[0].price === 12000);

  // --- Заказчик: выбор исполнителя и закрытие с исходом.
  await customer.goto(`${WEB}/account/jobs/${jobId}`, { waitUntil: 'networkidle' });
  await customer.locator('summary', { hasText: 'Выбрать исполнителем' }).click();
  await customer.getByRole('button', { name: /^Да, выбрать/ }).click();
  await customer.waitForURL(/\?accepted=1/, { timeout: 15_000 });
  check(
    'contractor chosen, job in progress',
    (await apiAs(customerContext, `/v1/me/jobs/${jobId}`)).body?.status === 'IN_PROGRESS',
  );
  await customer.locator('summary', { hasText: 'Закрыть заказ' }).click();
  await customer.getByRole('radio', { name: /Работы выполнены/ }).check();
  // Кнопка именно этой формы: на странице заказа есть и другие раскрывающиеся формы.
  await customer
    .locator('details', { has: customer.locator('summary', { hasText: 'Закрыть заказ' }) })
    .locator('button[type="submit"]')
    .click();
  await customer.waitForURL(/\?closed=done/, { timeout: 15_000 });
  check(
    'job closed as completed',
    (await apiAs(customerContext, `/v1/me/jobs/${jobId}`)).body?.closeOutcome === 'COMPLETED',
  );
  await contractor.goto(`${WEB}/account/bids`, { waitUntil: 'networkidle' });
  check(
    'contractor sees the bid in their list',
    await contractor.getByText(title).first().isVisible(),
  );

  // --- Все пройденные страницы на 320, 390 и 768 px.
  const pages = [
    ...new Map(visited.map((v) => [`${v.context === customerContext}${v.path}`, v])).values(),
  ];
  for (const width of [320, 390, 768]) {
    const overflow = [];
    for (const { context, path } of pages) {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${width}px ${path}: ${e.message}`));
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
      const [scroll, inner] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        window.innerWidth,
      ]);
      if (scroll > inner) overflow.push(`${path} ${scroll}>${inner}`);
      await page.close();
    }
    check(
      `${width} px: ${pages.length} pages without horizontal scroll`,
      overflow.length === 0,
      overflow.join(', '),
    );
  }
  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
} catch (error) {
  check('journey finished', false, error instanceof Error ? error.message : String(error));
  await customer.screenshot({ path: 'journey-e2e-failure.png', fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

checkCsp(check, cspViolations);
finish('journey e2e');
