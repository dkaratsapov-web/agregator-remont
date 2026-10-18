// Черновики нового заказа в настоящем браузере: автосохранение, продолжение после
// перезагрузки, список в «Мои заказы», удаление и публикация из черновика.
// Требует запущенные API и web (production-сборка), как jobs-integration.
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';

const { check, finish } = createChecker();
const owner = await registerViaApi('CUSTOMER');
const drafts = async () =>
  (await (await fetch(`${API}/v1/me/drafts`, { headers: owner.auth })).json()).items;
const jobsTotal = async () =>
  (await (await fetch(`${API}/v1/me/jobs?limit=1`, { headers: owner.auth })).json()).total;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const host = new URL(WEB).hostname;
await context.addCookies(
  owner.cookie.split('; ').map((pair) => {
    const [name, value] = pair.split('=');
    return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
  }),
);
const page = await context.newPage();

/** Заполняет форму до публикуемого состояния: категория «Другое» и её обязательные вопросы. */
async function fillValidJob(title) {
  await page.fill('input[name="title"]', title);
  await page.click('#field-category');
  await page.getByRole('option', { name: 'Другое' }).click();
  await page.fill('#field-city', 'Москва');
  await page.getByRole('option', { name: 'Москва', exact: true }).click();
  await page.fill('textarea[name="description"]', 'Повесить полки и карниз, всё на месте.');
  for (const group of await page.locator('[role="radiogroup"], [role="group"]').all()) {
    const required = await group.evaluate((el) =>
      Boolean(el.closest('[id^="q-"]')?.textContent?.includes('обязательно')),
    );
    if (required) await group.locator('button, [role="radio"], [role="checkbox"]').first().click();
  }
}

/** Задержка ответов Server Actions (сохранение черновика, публикация) на время сценария. */
async function withSlowActions(ms, run) {
  const handler = async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.headers()['next-action']) await sleep(ms);
    await route.continue();
  };
  await page.route('**/account/jobs/new**', handler);
  try {
    await run();
  } finally {
    await page.unroute('**/account/jobs/new**', handler);
  }
}

try {
  // --- автосохранение после паузы
  await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
  await page.fill('input[name="title"]', 'Черновик: плитка в ванной');
  await page.getByText('Черновик сохранён', { exact: false }).waitFor({ timeout: 15_000 });
  const saved = await drafts();
  check(
    'autosave creates a draft',
    saved.length === 1 && saved[0].title === 'Черновик: плитка в ванной',
  );
  const id = saved[0]?.id;
  check('address points at the draft', new URL(page.url()).searchParams.get('draft') === id);

  // --- кнопка «Сохранить черновик» обновляет тот же черновик
  await page.fill('textarea[name="description"]', 'Пол и стены, около 6 м².');
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await page.getByText('Черновик сохранён', { exact: false }).waitFor();
  await page.waitForTimeout(500);
  const afterButton = await drafts();
  check(
    'manual save updates the same draft',
    afterButton.length === 1 && afterButton[0].description === 'Пол и стены, около 6 м².',
    JSON.stringify(afterButton.map((d) => d.description)),
  );

  // --- продолжение после перезагрузки
  await page.reload({ waitUntil: 'networkidle' });
  check(
    'reload restores the draft',
    (await page.inputValue('input[name="title"]')) === 'Черновик: плитка в ванной' &&
      (await page.inputValue('textarea[name="description"]')) === 'Пол и стены, около 6 м².',
  );
  check('heading says draft', (await page.locator('h1').textContent())?.includes('Черновик'));

  // --- список и удаление в два нажатия
  await page.goto(`${WEB}/account/jobs`, { waitUntil: 'networkidle' });
  check(
    'drafts are listed in my jobs',
    await page.getByText('Черновик: плитка в ванной').isVisible(),
  );
  await page.getByRole('button', { name: 'Удалить' }).click();
  await page.getByRole('button', { name: 'Точно удалить?' }).click();
  await page.waitForURL(/draftDeleted=1/);
  check('draft is deleted after confirmation', (await drafts()).length === 0);

  // --- публикация из черновика удаляет черновик
  await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
  await page.fill('input[name="title"]', 'Опубликую из черновика');
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await page.getByText('Черновик сохранён', { exact: false }).waitFor();
  await fillValidJob('Опубликую из черновика');
  let before = await jobsTotal();
  await page.getByRole('button', { name: 'Опубликовать заказ' }).click();
  await page.waitForURL(/\/account\/jobs\/[^/?]+\?created=1/, { timeout: 15_000 });
  check('publishing from a draft creates the job', (await jobsTotal()) === before + 1);
  check('published draft is removed', (await drafts()).length === 0);

  // --- гонка: публикуют, пока создание черновика ещё в пути
  await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
  await fillValidJob('Гонка: новый черновик');
  before = await jobsTotal();
  await withSlowActions(2500, async () => {
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await page.getByText('Сохраняем черновик', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Опубликовать заказ' }).click();
    await page.waitForURL(/\/account\/jobs\/[^/?]+\?created=1/, { timeout: 20_000 });
  });
  await sleep(1500);
  check(
    'race (new draft): exactly one job is published',
    (await jobsTotal()) === before + 1,
    `jobs ${before} -> ${await jobsTotal()}`,
  );
  check('race (new draft): no draft is left behind', (await drafts()).length === 0);

  // --- гонка: публикуют, пока автосохранение существующего черновика в пути
  await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
  await fillValidJob('Гонка: правка черновика');
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await page.getByText('Черновик сохранён', { exact: false }).waitFor();
  before = await jobsTotal();
  await withSlowActions(2500, async () => {
    await page.fill('textarea[name="description"]', 'Повесить полки, карниз и зеркало в прихожей.');
    // Автосохранение срабатывает через 4 с после правки и застревает на задержке.
    await page.getByText('Сохраняем черновик', { exact: false }).waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Опубликовать заказ' }).click();
    await page.waitForURL(/\/account\/jobs\/[^/?]+\?created=1/, { timeout: 20_000 });
  });
  await sleep(1500);
  check(
    'race (autosave): exactly one job is published',
    (await jobsTotal()) === before + 1,
    `jobs ${before} -> ${await jobsTotal()}`,
  );
  check('race (autosave): no draft is left behind', (await drafts()).length === 0);

  // --- переход внутри сайта сразу после правки: черновик досохраняется
  await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
  await page.fill('input[name="title"]', 'Ушёл в каталог сразу');
  await page.getByRole('link', { name: 'Заказы', exact: true }).click();
  await page.waitForURL(/\/jobs(\?|$)/);
  await sleep(2000);
  check(
    'leaving within the site saves the last change',
    (await drafts()).some((d) => d.title === 'Ушёл в каталог сразу'),
  );

  // --- закрытие вкладки с несохранёнными правками спрашивает подтверждение
  await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
  await page.fill('input[name="title"]', 'Закрываю вкладку');
  let asked = false;
  page.once('dialog', async (dialog) => {
    asked = dialog.type() === 'beforeunload';
    await dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await sleep(500);
  check('closing with unsaved changes asks to confirm', asked);
} catch (error) {
  check('drafts scenario finished', false, error instanceof Error ? error.message : String(error));
  await page.screenshot({ path: 'drafts-e2e-failure.png', fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
}

finish('drafts e2e');
