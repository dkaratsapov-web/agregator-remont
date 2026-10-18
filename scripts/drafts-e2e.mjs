// Черновики нового заказа в настоящем браузере: автосохранение, продолжение после
// перезагрузки, список в «Мои заказы», удаление и публикация из черновика.
// Требует запущенные API и web (production-сборка), как jobs-integration.
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';

const { check, finish } = createChecker();
const owner = await registerViaApi('CUSTOMER');
const drafts = async () =>
  (await (await fetch(`${API}/v1/me/drafts`, { headers: owner.auth })).json()).items;

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
  await page.click('#field-category');
  await page.getByRole('option', { name: 'Другое' }).click();
  await page.fill('#field-city', 'Москва');
  await page.getByRole('option', { name: 'Москва', exact: true }).click();
  await page.fill('textarea[name="description"]', 'Повесить полки и карниз, всё на месте.');
  // Обязательные вопросы категории «Другое»: отвечаем первым вариантом в каждом.
  for (const group of await page.locator('[role="radiogroup"], [role="group"]').all()) {
    const required = await group.evaluate((el) =>
      Boolean(el.closest('[id^="q-"]')?.textContent?.includes('обязательно')),
    );
    if (required) await group.locator('button, [role="radio"], [role="checkbox"]').first().click();
  }
  await page.getByRole('button', { name: 'Опубликовать заказ' }).click();
  await page.waitForURL(/\/account\/jobs\/[^/?]+\?created=1/, { timeout: 15_000 });
  check('publishing from a draft creates the job', /created=1/.test(page.url()));
  check('published draft is removed', (await drafts()).length === 0);
} catch (error) {
  check('drafts scenario finished', false, error instanceof Error ? error.message : String(error));
  await page.screenshot({ path: 'drafts-e2e-failure.png', fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
}

finish('drafts e2e');
