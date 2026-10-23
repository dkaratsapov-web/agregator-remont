// Доступность и удобство из аудита (docs/AUDIT_FINDINGS.md, UX-1…14), замеры LCP, CLS, INP и
// поведение видео пролёта на главной — в настоящем браузере на production-сборке.
// Требует запущенные API и web, как drafts-e2e. Числа замеров печатаются для
// docs/PERFORMANCE_REPORT.md; проверяются бюджеты (CLS < 0,1, LCP < 2,5 с, INP < 200 мс локально).
/* global window, document, getComputedStyle, MutationObserver -- выполняется в браузере через page.evaluate */
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const customer = await registerViaApi('CUSTOMER');
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const cspViolations = watchCsp(browser);
const host = new URL(WEB).hostname;
const cookies = customer.cookie.split('; ').map((pair) => {
  const [name, value] = pair.split('=');
  return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
});

async function newPage({ width = 1440, height = 1000, signedIn = false, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...options });
  if (signedIn) await context.addCookies(cookies);
  return context.newPage();
}

/** Контраст двух цветов rgb()/rgba() по WCAG (в браузере, по вычисленным стилям). */
const contrastIn = (page, selector, pseudo) =>
  page.evaluate(
    ([sel, pse]) => {
      const el = document.querySelector(sel);
      if (!el) return 0;
      // Любой формат цвета (rgb, oklch, color-mix) приводится к RGBA через canvas.
      const ctx = document.createElement('canvas').getContext('2d');
      const parse = (c) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      };
      const lum = ([r, g, b]) => {
        const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      let bgEl = el;
      let bg = 'rgba(0, 0, 0, 0)';
      while (bgEl && parse(bg)[3] === 0) {
        bg = getComputedStyle(bgEl).backgroundColor;
        bgEl = bgEl.parentElement;
      }
      const fg = parse(getComputedStyle(el, pse).color);
      const back = parse(bg);
      // Полупрозрачный текст смешивается с фоном.
      const a = fg[3] ?? 1;
      const mixed = [0, 1, 2].map((i) => fg[i] * a + back[i] * (1 - a));
      const [hi, lo] = [lum(mixed), lum(back)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    },
    [selector, pseudo ?? null],
  );

try {
  // --- UX-1, UX-13: без горизонтальной прокрутки и выхода за рамку на 320 px.
  for (const path of ['/', '/register', '/login', '/jobs']) {
    const page = await newPage({ width: 320, height: 640 });
    await page.goto(`${WEB}${path}`, { waitUntil: 'load' });
    const [scroll, inner] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    check(`320 px: ${path} has no horizontal scroll`, scroll <= inner, `${scroll} > ${inner}`);
    if (path === '/register') {
      const overflow = await page.$$eval('fieldset label', (labels) =>
        labels.some((l) => l.scrollWidth > l.clientWidth + 1),
      );
      check('320 px: role cards keep their text inside', !overflow);
    }
    await page.context().close();
  }

  // --- UX-2: скрытые кнопки первого экрана не получают фокус.
  {
    const page = await newPage();
    await page.goto(`${WEB}/`, { waitUntil: 'load' });
    // Пока виден прелоадер (до 3,3 с), прокрутка заблокирована.
    await page.waitForTimeout(3500);
    check(
      'hero is interactive at the top',
      await page.evaluate(() => !document.querySelector('#hero-title')?.closest('[inert]')),
    );
    await page.evaluate(() =>
      window.scrollTo({ top: window.innerHeight * 2, behavior: 'instant' }),
    );
    await page.waitForTimeout(1200);
    const focusable = await page.evaluate(() => {
      const hero = document.querySelector('#hero-title')?.closest('[inert]');
      return hero ? hero.querySelectorAll('a, button').length : -1;
    });
    check('scrolled hero is inert (CTAs leave the tab order)', focusable > 0, `links ${focusable}`);
    await page.context().close();
  }

  const app = await newPage({ signedIn: true });

  // --- UX-3: меню кабинета закрывается, когда фокус уходит Tab'ом.
  {
    await app.goto(`${WEB}/account`, { waitUntil: 'networkidle' });
    const button = app.getByRole('button', { name: /^Меню кабинета/ });
    await button.focus();
    await app.keyboard.press('Enter');
    check('menu opens from the keyboard', (await button.getAttribute('aria-expanded')) === 'true');
    for (let i = 0; i < 30; i += 1) {
      await app.keyboard.press('Tab');
      const inside = await app.evaluate(() =>
        Boolean(document.activeElement?.closest('nav[aria-label="Меню кабинета"]')),
      );
      if (!inside && i > 0) break;
    }
    check(
      'menu closes when focus leaves it',
      (await button.getAttribute('aria-expanded')) === 'false',
    );
  }

  // --- Город в каталоге: без запроса видны только области, города — после нажатия на область;
  // заголовок раскрытой области при прокрутке закрывает строки под собой без просвета.
  {
    const page = await newPage({ width: 1280, height: 900 });
    await page.goto(`${WEB}/jobs`, { waitUntil: 'networkidle' });
    await page.click('#catalog-city');
    const list = page.getByRole('listbox', { name: 'Подсказки' });
    await list.waitFor();
    const names = await list.getByRole('option').allTextContents();
    check(
      'city list opens with only the two regions collapsed',
      names.length === 2 &&
        names[0].startsWith('Москва и Московская область') &&
        names[1].startsWith('Санкт-Петербург и Ленинградская область'),
      names.join(' | '),
    );
    await list.getByRole('option', { name: /^Москва и Московская область/ }).click();
    const towns = list.getByRole('option', { name: 'Химки', exact: true });
    check('clicking a region shows its towns', await towns.isVisible());
    check(
      'the other region stays collapsed',
      (await list.getByRole('option', { name: 'Гатчина', exact: true }).count()) === 0,
    );
    // Прокрутка: прилипший заголовок стоит у верхнего края списка, над ним строк не видно.
    const gap = await list.evaluate((el) => {
      el.scrollTop = 400;
      const header = el.querySelector('[role="option"]');
      return Math.round(header.getBoundingClientRect().top - el.getBoundingClientRect().top);
    });
    check('sticky region header leaves no gap above it', gap <= 1, `${gap}px`);
    await list.getByRole('option', { name: /^Москва и Московская область/ }).click();
    check(
      'clicking the region again collapses it',
      (await list.getByRole('option', { name: 'Химки', exact: true }).count()) === 0,
    );
    // С клавиатуры: список заново (области свёрнуты), стрелка к области, Enter раскрывает,
    // ещё стрелка и Enter выбирают город.
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    check(
      'keyboard: Enter on a region expands it, then picks a town',
      (await page.inputValue('#catalog-city')) === 'Москва',
      await page.inputValue('#catalog-city'),
    );
    // Запрос показывает совпадения сразу, без раскрытия областей.
    await page.fill('#catalog-city', 'Гатч');
    check(
      'typing shows matches without expanding regions',
      await list.getByRole('option', { name: 'Гатчина', exact: true }).isVisible(),
    );
    await page.context().close();
  }

  // --- UX-4: Tab из поля города ведёт к следующему элементу, а не в список.
  {
    await app.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
    await app.fill('#field-city', 'Мо');
    await app.getByRole('listbox', { name: 'Подсказки' }).waitFor();
    await app.keyboard.press('Tab');
    const landed = await app.evaluate(() => ({
      tag: document.activeElement?.tagName,
      role: document.activeElement?.getAttribute('role'),
    }));
    check(
      'Tab from the city field skips the suggestion list',
      landed.tag !== 'BODY' && landed.role !== 'listbox',
      JSON.stringify(landed),
    );
  }

  // --- UX-5: ошибки у полей и фокус на первом поле с ошибкой.
  {
    const page = await newPage({ extraHTTPHeaders: { 'X-Forwarded-For': '10.252.0.9' } });
    await page.goto(`${WEB}/register`, { waitUntil: 'networkidle' });
    await page.fill('input[name="name"]', 'А');
    await page.fill('input[name="email"]', 'не-почта');
    await page.fill('input[name="password"]', 'короткий');
    // Проверка браузера (required, type=email) отключается: проверяем ответ сервера.
    await page.$eval('form:has(input[name="name"])', (f) => f.setAttribute('novalidate', ''));
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await page.getByText('Проверьте поля, отмеченные ниже.').waitFor();
    const invalid = await page.$$eval('[aria-invalid="true"]', (els) =>
      els.map((e) => e.getAttribute('name')),
    );
    check(
      'registration marks every invalid field',
      ['name', 'email', 'password'].every((n) => invalid.includes(n)),
      invalid.join(','),
    );
    check(
      'focus moves to the first invalid field',
      await page.evaluate(() => document.activeElement?.getAttribute('name') === 'name'),
    );
    check(
      'error text is linked to the field',
      await page.evaluate(() => {
        const input = document.querySelector('input[name="email"]');
        const ids = input?.getAttribute('aria-describedby')?.split(' ') ?? [];
        return ids.some((id) => document.getElementById(id)?.textContent?.includes('email'));
      }),
    );
    await page.context().close();
  }

  // --- UX-6, UX-12: контраст акцентной кнопки в тёмной теме и подсказок в полях.
  {
    // Тёмная тема — настройка оформления в кабинете: отдельный пользователь с темой «тёмная».
    const darkUser = await registerViaApi('CUSTOMER');
    await fetch(`${API}/v1/me/preferences`, {
      method: 'PATCH',
      headers: { ...darkUser.auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark' }),
    });
    const darkContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await darkContext.addCookies(
      darkUser.cookie.split('; ').map((pair) => {
        const [name, value] = pair.split('=');
        return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
      }),
    );
    const dark = await darkContext.newPage();
    await dark.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
    const isDark = await dark.evaluate(() =>
      Boolean(document.querySelector('[data-ui-theme="dark"]')),
    );
    const button = await contrastIn(dark, 'main form button[type="submit"]');
    check('dark theme: accent button text >= 4.5:1', isDark && button >= 4.5, button.toFixed(2));
    await darkContext.close();
    await app.goto(`${WEB}/account/jobs/new`, { waitUntil: 'networkidle' });
    // Цвет ::placeholder Chromium не отдаёт через getComputedStyle: проверяем, что подсказки
    // окрашены токеном --ink-soft без прозрачности, и контраст этого токена с фоном поля.
    const usesToken = await app.$eval('input[name="title"]', (i) =>
      i.className.split(/\s+/).includes('placeholder:text-ink-soft'),
    );
    await app.$eval('input[name="title"]', (i) => {
      const probe = document.createElement('span');
      probe.id = 'ux-probe';
      probe.className = 'text-ink-soft';
      i.after(probe);
    });
    const ratio = await contrastIn(app, '#ux-probe');
    check('placeholder text >= 4.5:1', usesToken && ratio >= 4.5, ratio.toFixed(2));
  }

  // --- UX-7, UX-8: видимый фокус у «Загрузить фото» и у поиска в шапке.
  {
    await app.goto(`${WEB}/account/settings`, { waitUntil: 'networkidle' });
    await app.locator('#avatar-file').focus();
    const outline = await app.$eval(
      'label[for="avatar-file"]',
      (l) => getComputedStyle(l).outlineStyle,
    );
    check('photo upload shows a focus outline', outline !== 'none', outline);
    const search = app.locator('header input[name="q"]:visible').first();
    await search.focus();
    await app.waitForTimeout(400); // переход цвета рамки 150 мс
    const [ring, accent] = await search.evaluate((i) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent)';
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(i.closest('label')).borderColor, value];
    });
    check('header search focus ring uses the accent', ring === accent, `${ring} vs ${accent}`);
  }

  // --- UX-10: завершение сеанса только после подтверждения.
  {
    const login = await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.252.0.10' },
      body: JSON.stringify({ email: customer.user.email, password: 'integration-password-123' }),
    });
    const other = (await login.json()).token;
    await app.goto(`${WEB}/account/settings`, { waitUntil: 'networkidle' });
    await app
      .locator('summary', { hasText: /^Завершить$/ })
      .first()
      .click();
    await app.waitForTimeout(500);
    const still = await fetch(`${API}/v1/me`, { headers: { Authorization: `Bearer ${other}` } });
    check('first click on "end session" only asks', still.status === 200);
    await app.getByRole('button', { name: 'Да, завершить сеанс' }).click();
    await app.waitForTimeout(1500);
    const gone = await fetch(`${API}/v1/me`, { headers: { Authorization: `Bearer ${other}` } });
    check('confirmed "end session" revokes it', gone.status === 401);
  }

  // --- UX-9: признак перехода между страницами при медленном ответе сервера.
  {
    await app.goto(`${WEB}/account`, { waitUntil: 'networkidle' });
    const slow = async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    };
    await app.route('**/account/settings**', slow);
    await app
      .locator('main a[href="/account/settings"], main a[href^="/account/settings#"]')
      .first()
      .click();
    const shown = await app
      .getByRole('progressbar', { name: 'Загружаем страницу' })
      .waitFor({ timeout: 1400 })
      .then(() => true)
      .catch(() => false);
    await app.waitForURL(/\/account\/settings/);
    await app.unroute('**/account/settings**', slow);
    await app.waitForTimeout(300);
    check('slow navigation shows a progress bar', shown);
    check(
      'progress bar disappears after the page loads',
      (await app.getByRole('progressbar', { name: 'Загружаем страницу' }).count()) === 0,
    );
  }

  // --- UX-14: текстовые ссылки не меньше 24 px.
  {
    await app.goto(`${WEB}/account`, { waitUntil: 'networkidle' });
    const small = await app.$$eval('main a', (links) =>
      links
        .filter((a) => !a.closest('p, li p') || a.closest('li'))
        .map((a) => [a.textContent?.trim(), a.getBoundingClientRect().height])
        .filter(([text, h]) => text && h > 0 && h < 24),
    );
    check('account page links are at least 24 px tall', small.length === 0, JSON.stringify(small));
  }

  // --- Замеры: LCP, CLS, INP (по реакции на нажатие).
  const vitals = async (page, path, interact) => {
    await page.addInitScript(() => {
      window.__vitals = { lcp: 0, cls: 0, inp: 0 };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__vitals.lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        // INP учитывает только взаимодействия (нажатие, клавиша), не наведение мыши.
        for (const e of list.getEntries()) {
          if (e.interactionId) window.__vitals.inp = Math.max(window.__vitals.inp, e.duration);
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    });
    await page.goto(`${WEB}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    if (interact) await interact(page);
    await page.waitForTimeout(500);
    return page.evaluate(() => window.__vitals);
  };
  const measured = [];
  for (const [path, signedIn, interact] of [
    ['/', false, (p) => p.mouse.wheel(0, 600)],
    ['/jobs', false, (p) => p.locator('input[name="q"]').last().click()],
    ['/account/jobs/new', true, (p) => p.click('#field-category')],
  ]) {
    for (const [label, opts] of [
      ['desktop', { width: 1440, height: 900 }],
      ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }],
    ]) {
      const page = await newPage({ ...opts, signedIn });
      const v = await vitals(page, path, interact);
      measured.push({ path, label, ...v });
      console.log(
        `     vitals ${path} ${label}: LCP ${v.lcp.toFixed(0)} ms, CLS ${v.cls.toFixed(3)}, INP ${v.inp.toFixed(0)} ms`,
      );
      await page.context().close();
    }
  }
  check(
    'CLS < 0.1 everywhere',
    measured.every((m) => m.cls < 0.1),
  );
  check(
    'LCP < 2.5 s everywhere (local)',
    measured.every((m) => m.lcp < 2500),
  );
  check(
    'INP < 200 ms everywhere (local)',
    measured.every((m) => m.inp < 200),
  );

  // --- Видео пролёта: вперёд после load, назад после него; при экономии трафика назад не
  // грузится; прокрутка вверх показывает обратный ролик.
  {
    const page = await newPage();
    await page.goto(`${WEB}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('video[src]').length === 2, null, {
      timeout: 20_000,
    });
    check('flight: forward and reverse clips load after the page', true);
    // Обратный ролик сайт включает, только когда у него есть данные (иначе доезд без видео,
    // flight-video.tsx). Адрес появляется раньше данных: на медленной машине CI ждём данные.
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('video')].every(
          (v) => v.readyState >= 2, // HAVE_CURRENT_DATA
        ),
      null,
      { timeout: 30_000 },
    );
    await page.evaluate(() =>
      window.scrollTo({ top: window.innerHeight * 2.5, behavior: 'instant' }),
    );
    await page.waitForTimeout(2500);
    // Запоминаем, показывался ли обратный ролик, пока прокручиваем вверх.
    await page.evaluate(() => {
      window.__reverseShown = false;
      const reverse = [...document.querySelectorAll('video')].find((v) =>
        v.src.includes('reverse'),
      );
      new MutationObserver(() => {
        if (reverse?.style.opacity === '1') window.__reverseShown = true;
      }).observe(reverse, { attributes: true, attributeFilter: ['style'] });
    });
    await page.mouse.move(700, 450);
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(250);
    }
    const reverseShown = await page
      .waitForFunction(() => window.__reverseShown === true, null, { timeout: 8_000 })
      .then(
        () => true,
        () => false,
      );
    check('flight: scrolling up plays the reverse clip', reverseShown);
    await page.context().close();

    const light = await newPage();
    await light.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true, effectiveType: '4g' },
      });
    });
    await light.goto(`${WEB}/`, { waitUntil: 'load' });
    await light.waitForTimeout(4000);
    const sources = await light.$$eval('video', (vs) => vs.map((v) => v.getAttribute('src') ?? ''));
    check(
      'flight: save-data loads only the forward clip',
      sources.filter(Boolean).length === 1 && !sources.some((s) => s.includes('reverse')),
      sources.join(' | '),
    );

    // Reduced motion: видео не грузится совсем, только картинка (ТЗ #40, п. 8).
    const calm = await newPage({ reducedMotion: 'reduce' });
    const media = [];
    calm.on('request', (r) => {
      if (/\.(mp4|webm)(\?|$)/.test(r.url())) media.push(r.url());
    });
    await calm.goto(`${WEB}/`, { waitUntil: 'load' });
    await calm.waitForTimeout(4000);
    check('flight: reduced motion downloads no video', media.length === 0, media.join(' | '));
    await calm.context().close();
    await light.context().close();
  }
} catch (error) {
  check('ux scenario finished', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

checkCsp(check, cspViolations);
finish('ux e2e');
