/* global document, window -- выполняется в браузере через evaluate */
// Аккаунты и доверие в настоящем браузере: ссылка для нового пароля от администратора и смена
// пароля по ней (без JS), отзыв об исполнителе и карточка мастера, рейтинг в откликах,
// избранное (без JS), «Переписки», «Мои жалобы» и решение в значке, подсказка о контактах и
// пометка автопроверки у администратора. Отдельно — формы без JS на страницах заказа отвечают
// ошибкой за секунды, а сервер после них отвечает другим (раньше связанное действие подвешивало
// рендер и загружало процессор: docs/NO_JS_FORMS.md). 320 px — без горизонтальной прокрутки.
// Администратор назначается прямо в базе (DATABASE_URL), как в moderation-e2e.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';

const { check, finish } = createChecker();
const RUN = Date.now().toString(36);
const owner = await registerViaApi('CUSTOMER');
const master = await registerViaApi('CONTRACTOR');
const other = await registerViaApi('CONTRACTOR');
const admin = await registerViaApi('CUSTOMER');
const db = (process.env.DATABASE_URL ?? '').replace(/\?.*$/, '');
execFileSync('psql', [db, '-qc', `UPDATE users SET role = 'ADMIN' WHERE id = '${admin.user.id}'`]);

const api = async (who, path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...who.auth, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

async function openJob(title) {
  const { body } = await api(owner, '/v1/me/jobs', {
    method: 'POST',
    body: {
      title,
      description: 'Покрасить стены в двух комнатах, шпаклёвка уже сделана.',
      category: 'FLOORING',
      details: { covering: 'laminate', area: 20 },
      city: 'Москва',
    },
  });
  return body.id;
}

/** Заказ с выбранным мастером; done — закрыт как выполненный. */
async function deal(title, { done = false } = {}) {
  const jobId = await openJob(title);
  const { body: bid } = await api(master, `/v1/jobs/${jobId}/bids`, {
    method: 'POST',
    body: { price: 40_000, durationDays: 5, comment: 'Покрашу за пять дней, материалы ваши.' },
  });
  await api(owner, `/v1/me/jobs/${jobId}/bids/${bid.id}/accept`, { method: 'POST' });
  if (done) {
    await api(owner, `/v1/me/jobs/${jobId}/close`, {
      method: 'POST',
      body: { outcome: 'COMPLETED' },
    });
  }
  return jobId;
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const host = new URL(WEB).hostname;
async function contextFor(who, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  if (who) {
    await context.addCookies(
      who.cookie.split('; ').map((pair) => {
        const [name, value] = pair.split('=');
        return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
      }),
    );
  }
  return context;
}
const errors = [];
const watch = (page) => page.on('pageerror', (e) => errors.push(e.message));

/** Сервер отвечает: обычная страница открывается быстро. */
async function serverResponsive() {
  const started = Date.now();
  const res = await fetch(`${WEB}/offline`, { signal: AbortSignal.timeout(5000) }).catch(
    () => null,
  );
  return res?.status === 200 && Date.now() - started < 3000;
}

try {
  // --- Ссылка для нового пароля: администратор выдаёт, человек меняет пароль без JS.
  {
    const adminPage = await (await contextFor(admin)).newPage();
    watch(adminPage);
    await adminPage.goto(`${WEB}/admin/users?q=${encodeURIComponent(owner.user.email)}`, {
      waitUntil: 'networkidle',
    });
    const row = adminPage.locator('main li', { hasText: owner.user.email });
    check('admin finds the person by email', (await row.count()) === 1);
    await row.getByText('Ссылка для нового пароля').click();
    await row.getByRole('button', { name: 'Создать ссылку' }).click();
    const linkField = row.getByLabel(/^Ссылка/);
    await linkField.waitFor();
    const link = await linkField.inputValue();
    check('the link points to /reset/<token>', /\/reset\/[A-Za-z0-9_-]{43}$/.test(link), link);

    const noJs = await (await contextFor(null, { javaScriptEnabled: false })).newPage();
    await noJs.goto(link.replace(/^https?:\/\/[^/]+/, WEB));
    check('the token leaves the address bar', new URL(noJs.url()).pathname === '/reset');
    await noJs.getByLabel('Новый пароль').fill('fresh-password-2026');
    await noJs.getByLabel('Пароль ещё раз').fill('another-password-2026');
    const started = Date.now();
    await noJs.getByRole('button', { name: 'Сохранить и войти' }).click();
    await noJs.getByText('Пароли не совпадают').waitFor({ timeout: 8000 });
    check('without JS a mistake comes back within seconds', Date.now() - started < 8000);
    await noJs.getByLabel('Новый пароль').fill('fresh-password-2026');
    await noJs.getByLabel('Пароль ещё раз').fill('fresh-password-2026');
    await noJs.getByRole('button', { name: 'Сохранить и войти' }).click();
    await noJs.waitForURL(/\/account\?password=reset/);
    check('the new password signs in', true);
    const old = await fetch(`${API}/v1/me`, { headers: owner.auth });
    check('previous sessions ended', old.status === 401, `${old.status}`);
    const relogin = await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: owner.user.email, password: 'fresh-password-2026' }),
    });
    const fresh = await relogin.json();
    owner.auth = { Authorization: `Bearer ${fresh.token}` };
    owner.cookie = `__Host-ar_session=${fresh.token}; ar_session=${fresh.token}`;
    // Использованная ссылка: форма открывается, но API её не принимает.
    await noJs.goto(link.replace(/^https?:\/\/[^/]+/, WEB));
    await noJs.getByLabel('Новый пароль').fill('third-password-2026');
    await noJs.getByLabel('Пароль ещё раз').fill('third-password-2026');
    await noJs.getByRole('button', { name: 'Сохранить и войти' }).click();
    await noJs
      .getByText(/устарела|недействительна/)
      .first()
      .waitFor({ timeout: 8000 });
    check('a used link is refused', true);
    await noJs.context().close();
    await adminPage.context().close();
  }

  // --- Отзыв после выполненного заказа, рейтинг и карточка мастера.
  const doneJob = await deal(`Отзывы ${RUN}: покраска стен`, { done: true });
  const ownerPage = await (await contextFor(owner)).newPage();
  watch(ownerPage);
  await ownerPage.goto(`${WEB}/account/jobs/${doneJob}`, { waitUntil: 'networkidle' });
  const review = ownerPage.locator('#review');
  await review.getByText('5 — Отлично').click();
  await review.getByLabel(/^Отзыв/).fill('Покрасил аккуратно и в срок.');
  await review.getByRole('button', { name: 'Оставить отзыв' }).click();
  await ownerPage.getByText('Спасибо, отзыв опубликован на карточке мастера.').waitFor();
  check('owner leaves a review after the job is done', true);
  const masterUser = (await api(master, '/v1/me')).body;
  const cardPage = await (await contextFor(other)).newPage();
  watch(cardPage);
  await cardPage.goto(`${WEB}/contractors/${masterUser.publicId}`, { waitUntil: 'networkidle' });
  const cardText = await cardPage.locator('main').textContent();
  check(
    'the card shows the rating and the review, without contacts',
    cardText.includes('5,0') &&
      cardText.includes('Покрасил аккуратно и в срок.') &&
      !cardText.includes(master.user.email),
  );

  const nextJob = await openJob(`Отзывы ${RUN}: второй заказ`);
  await api(master, `/v1/jobs/${nextJob}/bids`, {
    method: 'POST',
    body: { price: 35_000, durationDays: 4, comment: 'Сделаю за четыре дня, опыт есть.' },
  });
  await ownerPage.goto(`${WEB}/account/jobs/${nextJob}`, { waitUntil: 'networkidle' });
  const bidRow = ownerPage.locator('#bids li').first();
  check(
    'the bid shows the rating and links to the card',
    (await bidRow.textContent()).includes('5,0') &&
      (await bidRow.getByRole('link', { name: 'Карточка мастера' }).getAttribute('href')) ===
        `/contractors/${masterUser.publicId}`,
  );

  // --- Без JS: ошибки форм на страницах заказа возвращаются, сервер не зависает.
  {
    const noJs = await (await contextFor(other, { javaScriptEnabled: false })).newPage();
    await noJs.goto(`${WEB}/jobs/${nextJob}`);
    await noJs.getByLabel('Ваша цена, ₽').fill('дорого');
    await noJs
      .getByLabel('Комментарий для заказчика')
      .fill('Сделаю быстро и аккуратно, есть опыт.');
    const started = Date.now();
    await noJs.getByRole('button', { name: 'Откликнуться' }).click();
    await noJs.locator('[aria-invalid="true"], [role="alert"]').first().waitFor({ timeout: 8000 });
    check('without JS the bid form shows its error within seconds', Date.now() - started < 8000);
    check('the server keeps answering after a no-JS form error', await serverResponsive());

    await noJs.getByRole('button', { name: 'В избранное' }).click();
    await noJs.getByRole('button', { name: 'В избранном' }).waitFor();
    check('without JS a job goes to favorites', true);
    await noJs.goto(`${WEB}/account/favorites`);
    check(
      'favorites list the job',
      await noJs.getByRole('link', { name: `Отзывы ${RUN}: второй заказ` }).isVisible(),
    );
    await noJs.context().close();

    const ownerNoJs = await (await contextFor(owner, { javaScriptEnabled: false })).newPage();
    await ownerNoJs.goto(`${WEB}/account/jobs/${doneJob}`);
    // Отзыв уже оставлен: без JS страница показывает его, а не форму.
    const reviewForm = await ownerNoJs.locator('#review form').count();
    check('a reviewed job shows the review instead of the form', reviewForm === 0);
    check('the server keeps answering', await serverResponsive());
    await ownerNoJs.context().close();
  }

  // --- «Переписки» и подсказка о контактах; пометка автопроверки у администратора.
  {
    const chatJob = await deal(`Переписки ${RUN}: ванная`);
    const masterPage = await (await contextFor(master)).newPage();
    watch(masterPage);
    await masterPage.goto(`${WEB}/account/chats`, { waitUntil: 'networkidle' });
    const link = masterPage.getByRole('link', { name: new RegExp(`Переписки ${RUN}`) });
    check(
      'chats list the deal and lead to the work page',
      (await link.getAttribute('href')) === `/account/work/${chatJob}#chat`,
    );
    await masterPage.goto(`${WEB}/account/work/${chatJob}`, { waitUntil: 'networkidle' });
    const box = masterPage.locator('#chat textarea[name="body"]');
    await box.fill('Звоните +7 999 123-45-67');
    await masterPage.getByText(/Похоже, в тексте есть контакты \(телефон\)/).waitFor();
    check('typing a phone number shows the contacts hint', true);
    await masterPage.locator('#chat').getByRole('button', { name: 'Отправить' }).click();
    await masterPage.locator('#chat li', { hasText: '+7 999 123-45-67' }).waitFor();
    const adminPage = await (await contextFor(admin)).newPage();
    watch(adminPage);
    await adminPage.goto(`${WEB}/admin/reports?status=OPEN&view=flags`, {
      waitUntil: 'networkidle',
    });
    check(
      'admin sees the contacts flag',
      await adminPage
        .locator('main li', { hasText: `Переписки ${RUN}` })
        .getByText(/похоже на контакты \(телефон\)/)
        .isVisible(),
    );
    await masterPage.context().close();
    await adminPage.context().close();
  }

  // --- «Мои жалобы»: решение администратора в значке, пока его не открыли.
  {
    const target = await openJob(`Жалобы ${RUN}: подозрительный заказ`);
    const { body: filed } = await api(other, '/v1/reports', {
      method: 'POST',
      body: { targetType: 'JOB', targetId: target, reason: 'FAKE' },
    });
    await api(admin, `/v1/admin/reports/${filed.id}/resolve`, {
      method: 'POST',
      body: { status: 'DISMISSED', note: 'Заказ настоящий, заказчик подтвердил' },
    });
    const page = await (await contextFor(other)).newPage();
    watch(page);
    await page.goto(`${WEB}/account`, { waitUntil: 'networkidle' });
    const bell = page.locator('header a[href="/account/notifications"]').first();
    check(
      'the decision counts in the bell',
      /непрочитанных [1-9]/.test((await bell.getAttribute('aria-label')) ?? ''),
    );
    await page.goto(`${WEB}/account/reports`, { waitUntil: 'networkidle' });
    check(
      'my reports show the decision',
      await page
        .getByText('Решение администратора: Заказ настоящий, заказчик подтвердил')
        .isVisible(),
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('header a[href="/account/notifications"]')
          ?.getAttribute('aria-label') === 'Уведомления',
      null,
      { timeout: 10_000 },
    );
    check('opening my reports clears the bell', true);
    await page.context().close();
  }

  // --- Контакты по согласию: без JS заказчик показывает свои, мастер видит, затем скрыть.
  {
    const contactJob = await deal(`Контакты ${RUN}: кухня`);
    const phoneSet = await api(owner, '/v1/me', {
      method: 'PATCH',
      body: { phone: '+79001234567' },
    });
    if (phoneSet.status !== 200) throw new Error(`owner phone not saved: ${phoneSet.status}`);
    const masterPage = await (await contextFor(master)).newPage();
    watch(masterPage);
    const contacts = masterPage.locator('#contacts');
    await masterPage.goto(`${WEB}/account/work/${contactJob}`, { waitUntil: 'networkidle' });
    check(
      'contacts stay hidden until their owner shares them',
      await contacts.getByText('Контакты пока скрыты.').isVisible(),
    );
    const ownerNoJs = await (await contextFor(owner, { javaScriptEnabled: false })).newPage();
    const mine = ownerNoJs.locator('#contacts');
    await ownerNoJs.goto(`${WEB}/account/jobs/${contactJob}`);
    await mine.getByRole('button', { name: 'Показать мои контакты' }).click();
    await mine.getByRole('button', { name: 'Скрыть мои контакты' }).waitFor();
    check('without JS the owner shares contacts', true);
    check('the server keeps answering', await serverResponsive());
    await masterPage.reload({ waitUntil: 'networkidle' });
    check(
      'the contractor sees the shared phone',
      await contacts.locator('a[href="tel:+79001234567"]').isVisible(),
    );
    await mine.getByRole('button', { name: 'Скрыть мои контакты' }).click();
    await mine.getByRole('button', { name: 'Показать мои контакты' }).waitFor();
    await masterPage.reload({ waitUntil: 'networkidle' });
    check(
      'hidden again, the phone disappears',
      (await contacts.locator('a[href^="tel:"]').count()) === 0,
    );
    await masterPage.setViewportSize({ width: 320, height: 700 });
    const [scroll, inner] = await masterPage.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    check('320 px: the work page with contacts fits', scroll <= inner, `${scroll} > ${inner}`);
    await masterPage.context().close();
    await ownerNoJs.context().close();
  }

  // --- 320 px: новые страницы без горизонтальной прокрутки.
  for (const [who, path] of [
    [admin, '/admin/users'],
    [other, `/contractors/${masterUser.publicId}`],
    [other, '/account/reports'],
    [other, '/account/favorites'],
    [master, '/account/chats'],
  ]) {
    const narrow = await (
      await contextFor(who, { viewport: { width: 320, height: 700 } })
    ).newPage();
    await narrow.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
    const [scroll, inner] = await narrow.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    check(`320 px: ${path} fits`, scroll <= inner, `${scroll} > ${inner}`);
    await narrow.context().close();
  }

  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
} catch (error) {
  check(
    'accounts scenario finished',
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  await browser.close();
}

finish('accounts e2e');
