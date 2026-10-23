// «Свои данные» в настройках (docs/ACCOUNTS.md, «Свои данные»): скачивание файла и удаление
// аккаунта в настоящем браузере, с JS и без. Требует запущенные API и web.
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const PASSWORD = 'integration-password-123';

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const cspViolations = watchCsp(browser);
const host = new URL(WEB).hostname;
const contextFor = async (who, options = {}) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    acceptDownloads: true,
    ...options,
  });
  await context.addCookies(
    who.cookie.split('; ').map((pair) => {
      const [name, value] = pair.split('=');
      return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
    }),
  );
  return context;
};
const me = (who) => fetch(`${API}/v1/me`, { headers: who.auth }).then((r) => r.status);

try {
  for (const [name, options] of [
    ['with JS', {}],
    ['without JS', { javaScriptEnabled: false }],
  ]) {
    const who = await registerViaApi('CUSTOMER');
    const page = await (await contextFor(who, options)).newPage();
    await page.goto(`${WEB}/account/settings#data`, { waitUntil: 'networkidle' });

    // Скачивание: файл с именем от API, внутри свой email и нет хеша пароля.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Скачать файл' }).click(),
    ]);
    const file = await download.path();
    const { readFile } = await import('node:fs/promises');
    const data = JSON.parse(await readFile(file, 'utf8'));
    check(
      `${name}: the file is named garantych-<id>-<date>.json`,
      /^garantych-\d+-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()),
      download.suggestedFilename(),
    );
    check(`${name}: the file holds own email`, data.account?.email === who.user.email);
    check(`${name}: no password hash in the file`, !JSON.stringify(data).includes('argon2'));

    // Неверный пароль: ошибка рядом с формой, аккаунт на месте.
    const form = page.locator('form', {
      has: page.getByRole('button', { name: 'Удалить аккаунт' }),
    });
    await form.getByLabel('Текущий пароль').fill('wrong-password-1');
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Удалить аккаунт' }).click();
    const alert = form.getByRole('alert');
    await alert.waitFor({ timeout: 10_000 }).catch(() => undefined);
    check(
      `${name}: a wrong password is refused next to the form`,
      ((await alert.textContent().catch(() => '')) ?? '').includes('Пароль указан неверно'),
    );
    check(`${name}: the account is still there`, (await me(who)) === 200);

    // Верный пароль: страница входа с пометкой, сессия больше не действует. Страница настроек
    // открывается заново: без JS после ошибки она ещё дорисовывается, и форма «прыгает».
    await page.goto(`${WEB}/account/settings#data`, { waitUntil: 'load' });
    const again = page.locator('form', {
      has: page.getByRole('button', { name: 'Удалить аккаунт' }),
    });
    await again.getByLabel('Текущий пароль').fill(PASSWORD);
    await again.getByRole('checkbox').check();
    await Promise.all([
      page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 }),
      again.getByRole('button', { name: 'Удалить аккаунт' }).click(),
    ]);
    const status = await page.getByRole('status').first().textContent();
    check(
      `${name}: the login page says the account is deleted`,
      status?.includes('Аккаунт удалён'),
    );
    check(`${name}: the session no longer works`, (await me(who)) === 401);
    const login = await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: who.user.email, password: PASSWORD }),
    });
    check(`${name}: the old email and password do not log in`, login.status === 401);
  }
  checkCsp(check, cspViolations);
} finally {
  await browser.close();
}
finish('account data e2e');
