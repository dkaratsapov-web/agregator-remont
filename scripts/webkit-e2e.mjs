/* global window, document -- выполняется в браузере через page.evaluate */
// Safari (Playwright WebKit, эмуляция iPhone) на production-сборке (ТЗ #40, п. 8).
// WebKit не отдаёт LCP, INP и сдвиги макета, поэтому здесь поведение, а не цифры: главная без
// горизонтальной прокрутки и ошибок JS, первый кадр виден, видео выбирается и не ломает
// страницу, при reduced motion видео не грузится, скрытые кнопки первого экрана не в фокусе,
// вход показывает ошибку у поля. Цифры — scripts/perf/web-vitals.mjs (Chromium).
import { devices, webkit } from 'playwright';
import { WEB, createChecker } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const browser = await webkit.launch();
const cspViolations = watchCsp(browser);
const iphone = devices['iPhone 13'];

async function open(path, options = {}) {
  const context = await browser.newContext({ ...iphone, ...options });
  const page = await context.newPage();
  const errors = [];
  const media = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/\.(mp4|webm)(\?|$)/.test(r.url())) media.push(r.url());
  });
  await page.goto(`${WEB}${path}`, { waitUntil: 'load' });
  return { page, errors, media, context };
}

try {
  {
    const { page, errors, media, context } = await open('/');
    await page.waitForTimeout(5000);
    const [scroll, inner] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    check('safari: home without horizontal scroll', scroll <= inner, `${scroll} > ${inner}`);
    check(
      'safari: first frame image is shown',
      await page.evaluate(() =>
        [...document.querySelectorAll('img')].some(
          (i) =>
            /flight-v3\/(.*poster\.avif|final\.webp)/.test(i.currentSrc || i.src) &&
            i.complete &&
            i.naturalWidth > 0,
        ),
      ),
    );
    const chosen = await page.evaluate(() =>
      [...document.querySelectorAll('video')].map((v) => v.getAttribute('src') ?? ''),
    );
    check(
      'safari: a playable flight clip is chosen (or the image stays)',
      media.length > 0 ? chosen.some((s) => /mobile-forward\.(mp4|webm)$/.test(s)) : true,
      chosen.join(' | '),
    );
    await page.evaluate(() =>
      window.scrollTo({ top: window.innerHeight * 2, behavior: 'instant' }),
    );
    await page.waitForTimeout(1500);
    check(
      'safari: scrolled hero is inert',
      await page.evaluate(() => Boolean(document.querySelector('#hero-title')?.closest('[inert]'))),
    );
    check('safari: no JavaScript errors on the home page', errors.length === 0, errors.join(' | '));
    await context.close();
  }
  {
    const { page, media, context } = await open('/', { reducedMotion: 'reduce' });
    await page.waitForTimeout(4000);
    check('safari: reduced motion downloads no video', media.length === 0, media.join(' | '));
    check(
      'safari: reduced motion shows steps as a list',
      await page.locator('h2#how-it-works').isVisible(),
    );
    await context.close();
  }
  {
    const { page, errors, context } = await open('/login', {
      extraHTTPHeaders: { 'X-Forwarded-For': '10.253.0.7' },
    });
    await page.fill('input[name="email"]', 'nobody@example.ru');
    await page.fill('input[name="password"]', 'wrong-password-123');
    await page.getByRole('button', { name: 'Войти' }).click();
    await page
      .getByText('Неверный email или пароль', { exact: false })
      .waitFor({ timeout: 15_000 });
    check(
      'safari: wrong password is marked on the field',
      (await page.getAttribute('input[name="password"]', 'aria-invalid')) === 'true',
    );
    check('safari: no JavaScript errors on login', errors.length === 0, errors.join(' | '));
    await context.close();
  }
} catch (error) {
  check('webkit scenario finished', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

checkCsp(check, cspViolations);
finish('webkit e2e');
