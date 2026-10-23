// Заказ с несколькими категориями в настоящем браузере: позиции в форме, публикация,
// страница заказа и каталог по дополнительной категории. Требует запущенные API и web.
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const owner = await registerViaApi('CUSTOMER');

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const cspViolations = watchCsp(browser);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const host = new URL(WEB).hostname;
await context.addCookies(
  owner.cookie.split('; ').map((pair) => {
    const [name, value] = pair.split('=');
    return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
  }),
);
const page = await context.newPage();
// Уникальное название: заказы прошлых запусков на той же базе не мешают проверке каталога.
const title = `Ванная: плитка и сантехника ${Date.now().toString(36)}`;

// Общий пакет собран (pnpm build); импорт по пути: в корне репозитория его нет в node_modules.
const shared = await import(new URL('../packages/shared/dist/index.js', import.meta.url).href);

/** Отвечает на обязательные вопросы категории первым вариантом (как requiredAnswers в API). */
async function answerRequired(category, prefix = '') {
  const answers = {};
  for (let changed = true; changed;) {
    changed = false;
    const visible = shared.visibleJobQuestionIds(category, answers);
    for (const { question } of shared.flattenJobQuestions(category)) {
      if (!question.required || !visible.has(question.id) || question.id in answers) continue;
      const block = page.locator(`#q-${prefix}${question.id}`);
      if (question.type === 'number') {
        await block.locator('input').first().fill(String(question.min));
        answers[question.id] = question.min;
      } else if (question.type === 'text') {
        await block.locator('input, textarea').first().fill('Ответ для теста');
        answers[question.id] = 'x';
      } else {
        await block.locator('[role="radio"], [role="checkbox"]').first().click();
        answers[question.id] =
          question.type === 'multi'
            ? [question.options[0].value]
            : (question.options?.[0]?.value ?? false);
      }
      changed = true;
    }
  }
}

try {
  await page.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
  await page.fill('input[name="title"]', title);
  await page.click('#field-category');
  await page.getByRole('option', { name: 'Плиточные работы' }).click();
  await page.fill('#field-city', 'Москва');
  await page.getByRole('option', { name: 'Москва', exact: true }).click();
  await answerRequired('TILING');

  await page.getByRole('button', { name: /Добавить работы другой категории/ }).click();
  const position = page.locator('#job-position-2');
  check('a position card appears', await position.isVisible());
  await position.locator('#job-position-2-category').click();
  const offered = await page.getByRole('option').allTextContents();
  check('the main category is not offered again', !offered.includes('Плиточные работы'));
  await page.getByRole('option', { name: 'Сантехника' }).click();
  await answerRequired('PLUMBING', 'p2-');
  await page.fill('textarea[name="description"]', 'Плитка на пол и стены, заменить смеситель.');

  await page.getByRole('button', { name: 'Опубликовать заказ' }).click();
  await page.waitForURL(/\/account\/jobs\/[^/?]+\?created=1/, { timeout: 15_000 });
  const id = /\/account\/jobs\/([^?]+)/.exec(page.url())?.[1];
  const job = await (await fetch(`${API}/v1/jobs/${id}`)).json();
  check(
    'job is published with two categories',
    job.category === 'TILING' && job.extraItems?.[0]?.category === 'PLUMBING',
    JSON.stringify([job.category, job.extraItems?.map((i) => i.category)]),
  );

  await page.goto(`${WEB}/jobs/${id}`, { waitUntil: 'networkidle' });
  const headings = await page.locator('h2').allTextContents();
  check(
    'job page shows a block per category',
    headings.includes('Плиточные работы') && headings.includes('Сантехника'),
    headings.join(' | '),
  );

  await page.goto(`${WEB}/jobs?category=PLUMBING`, { waitUntil: 'networkidle' });
  check(
    'catalog finds the job by the extra category',
    await page.getByRole('link', { name: title }).isVisible(),
  );
} catch (error) {
  check(
    'job items scenario finished',
    false,
    error instanceof Error ? error.message : String(error),
  );
  await page.screenshot({ path: 'drafts-e2e-failure.png', fullPage: true }).catch(() => undefined);
} finally {
  await browser.close();
}

checkCsp(check, cspViolations);
finish('job items e2e');
