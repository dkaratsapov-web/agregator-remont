// Браузерный тест публичной главной за Caddy: node scripts/landing-e2e.mjs
// Ожидает web за Caddy с deploy/Caddyfile на BASE_URL (http://localhost подходит для service
// worker), логин/пароль basic auth в BASIC_USER/BASIC_PASS и команду STOP_PROXY_CMD, которая
// останавливает Caddy (для проверки офлайн-страницы; запускается последней).
/* global window, getComputedStyle -- выполняется в браузере через page.evaluate */
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';
import { API, registerViaApi } from './lib/forms.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const USER = process.env.BASIC_USER ?? 'tester';
const PASS = process.env.BASIC_PASS ?? 'ci-password';
const STOP_PROXY_CMD = process.env.STOP_PROXY_CMD;
const PUBLIC_PATHS = [
  /^\/$/,
  /^\/offline$/,
  /^\/sw\.js$/,
  /^\/manifest\.webmanifest$/,
  /^\/icon\.svg$/,
  /^\/apple-icon\.png$/,
  /^\/icons\//,
  /^\/landing\//,
  /^\/_next\/static\//,
];

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

/** Ждём, пока service worker активирован и управляет страницей. */
async function controlledBySw(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: 'load' });
  }
  return page.evaluate(() => Boolean(navigator.serviceWorker.controller));
}

try {
  // 1. Главная без пароля: 200, без ошибок и без запросов в закрытую часть.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const bad = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (
        url.origin === new URL(BASE).origin &&
        !PUBLIC_PATHS.some((re) => re.test(url.pathname))
      ) {
        bad.push(`request ${url.pathname}`);
      }
    });
    page.on('response', (res) => {
      if (res.status() >= 400) bad.push(`${res.status()} ${res.url()}`);
    });
    page.on('pageerror', (err) => bad.push(`pageerror ${err.message}`));
    const res = await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    check('landing is public (200)', res?.status() === 200, `got ${res?.status()}`);
    check('landing title', (await page.title()).includes('Гарантыч'));
    for (let y = 0; y <= 12000; y += 800) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(80);
    }
    await page.hover('a[href="/login"] >> nth=0');
    await page.waitForTimeout(500);
    check('landing makes no private or failing requests', bad.length === 0, bad.join('; '));

    // 1б. Вошедший пользователь с фото: главная тоже не обращается в закрытую часть. Фото
    // отдаётся по /account/avatar за паролем, и запрос картинки при загрузке вызвал бы окно
    // ввода пароля у того, кто не вводил его в этом браузере.
    {
      const user = await registerViaApi('CUSTOMER');
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
      const form = new FormData();
      form.set('file', new Blob([png], { type: 'image/png' }), 'avatar.png');
      const upload = await fetch(`${API}/v1/me/avatar`, {
        method: 'PUT',
        headers: user.auth,
        body: form,
      });
      check('test user has a profile photo', upload.status === 200, `got ${upload.status}`);
      const signedIn = await browser.newContext();
      await signedIn.addCookies(
        user.cookie.split('; ').map((pair) => {
          const [name, value] = pair.split('=');
          // Как в drafts-e2e: domain + path (вариант url + secure Chromium отклоняет на http).
          return {
            name,
            value,
            domain: new URL(BASE).hostname,
            path: '/',
            secure: name.startsWith('__Host-'),
          };
        }),
      );
      const page2 = await signedIn.newPage();
      const privateRequests = [];
      page2.on('request', (req) => {
        const url = new URL(req.url());
        if (
          url.origin === new URL(BASE).origin &&
          !PUBLIC_PATHS.some((re) => re.test(url.pathname))
        ) {
          privateRequests.push(url.pathname);
        }
      });
      await page2.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      check(
        'signed-in landing makes no private requests',
        privateRequests.length === 0,
        privateRequests.join(', '),
      );
      check(
        'signed-in landing offers the cabinet',
        await page2.getByRole('link', { name: 'Перейти в кабинет' }).first().isVisible(),
      );
      await signedIn.close();
    }

    // 2. Прелоадер не держит экран дольше жёсткого предела.
    const fresh = await context.newPage();
    await fresh.goto(`${BASE}/`, { waitUntil: 'commit' });
    await fresh.waitForTimeout(3300);
    const hidden = await fresh.$eval('.preloader', (el) => getComputedStyle(el).visibility);
    check('preloader hidden within 3.3 s', hidden === 'hidden', `visibility ${hidden}`);

    await context.close();
  }

  // 4. Reduced motion: прелоадера нет, шаги показаны списком.
  {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const display = await page.$eval('.preloader', (el) => getComputedStyle(el).display);
    check('reduced motion: no preloader', display === 'none', `display ${display}`);
    check('reduced motion: steps as a list', await page.locator('h2#how-it-works').isVisible());
    await context.close();
  }

  // 5. SW управляет страницей, вход в закрытую часть без сохранённого пароля: навигация
  //    уходит мимо SW (ответ 401 приходит из сети, браузер может показать диалог пароля).
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    check('service worker controls the landing', await controlledBySw(page));
    const native = page.waitForResponse(
      (res) => res.url() === `${BASE}/jobs` && res.status() === 401 && !res.fromServiceWorker(),
      { timeout: 15_000 },
    );
    await page.goto(`${BASE}/jobs`).catch(() => {});
    const res = await native.catch(() => null);
    check('private page without password: native 401 (password prompt possible)', res !== null);
    await context.close();
  }

  // 6. С паролем закрытая часть открывается через SW, а при недоступном сервере SW отдаёт
  //    офлайн-страницу, хотя navigator.onLine остаётся true.
  {
    const context = await browser.newContext({
      httpCredentials: { username: USER, password: PASS },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    check('service worker controls the page (with password)', await controlledBySw(page));
    const ok = page.waitForResponse((res) => res.url() === `${BASE}/jobs` && res.status() === 200, {
      timeout: 15_000,
    });
    await page.goto(`${BASE}/jobs`).catch(() => {});
    check('private page with password: 200', (await ok.catch(() => null)) !== null);
    await page.waitForLoadState('load');
    const heading = await page
      .locator('h1')
      .first()
      .textContent({ timeout: 5000 })
      .catch(() => '');
    check('catalog rendered', Boolean(heading));

    if (STOP_PROXY_CMD) {
      execSync(STOP_PROXY_CMD, { stdio: 'inherit' });
      for (const path of ['/', '/jobs']) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'load' }).catch(() => {});
        const text =
          (await page
            .locator('body')
            .textContent()
            .catch(() => '')) ?? '';
        check(`server down: ${path} shows the offline page`, text.includes('Нет подключения'));
      }
      check('navigator.onLine stays true', await page.evaluate(() => navigator.onLine));
    } else {
      console.log('skip offline check: STOP_PROXY_CMD is not set');
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} landing check(s) failed`);
  process.exit(1);
}
console.log('\nLanding browser checks passed');
