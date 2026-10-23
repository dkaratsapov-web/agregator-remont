/* global document, window -- выполняется в браузере через evaluate */
// Переписка и фото в настоящем браузере двумя пользователями (фаза 2): заказчик пишет,
// исполнитель видит без перезагрузки и отвечает с фото (уменьшается в браузере); миниатюра
// показывается, полное фото открывается; сдача этапа с фото-отчётом; сообщение без JS;
// посторонний не видит фото; после закрытия заказа писать нельзя. Состояние сверяется с API.
// Требует запущенные API и web (production-сборка), как plan-e2e.
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const owner = await registerViaApi('CUSTOMER');
const contractor = await registerViaApi('CONTRACTOR');
const stranger = await registerViaApi('CONTRACTOR');

const api = async (who, path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...who.auth, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

/** Заказ в работе с согласованным планом из одного этапа. */
async function dealViaApi(title) {
  const { body: job } = await api(owner, '/v1/me/jobs', {
    method: 'POST',
    body: {
      title,
      description: 'Повесить полки, карниз и зеркало в прихожей.',
      category: 'FLOORING',
      details: { covering: 'laminate', area: 12 },
      city: 'Москва',
    },
  });
  const { body: bid } = await api(contractor, `/v1/jobs/${job.id}/bids`, {
    method: 'POST',
    body: { price: 15_000, durationDays: 2, comment: 'Сделаю за два дня, крепёж свой.' },
  });
  await api(owner, `/v1/me/jobs/${job.id}/bids/${bid.id}/accept`, { method: 'POST' });
  const base = `/v1/jobs/${job.id}`;
  const draft = await api(contractor, `${base}/plan`, {
    method: 'PUT',
    body: { version: 0, sequential: true, stages: [{ title: 'Монтаж', description: '' }] },
  });
  const proposed = await api(contractor, `${base}/plan/propose`, {
    method: 'POST',
    body: { version: draft.body.version },
  });
  await api(owner, `${base}/plan/approve`, {
    method: 'POST',
    body: { version: proposed.body.version },
  });
  return job.id;
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const cspViolations = watchCsp(browser);
const host = new URL(WEB).hostname;
async function contextFor(who, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ...options });
  await context.addCookies(
    who.cookie.split('; ').map((pair) => {
      const [name, value] = pair.split('=');
      return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
    }),
  );
  return context;
}
const errors = [];
const watch = (page) => page.on('pageerror', (e) => errors.push(e.message));

// Большое «фото с телефона» (4000×3000 JPEG с шумом, несколько МБ) рисуется в браузере:
// браузер страницы должен уменьшить его перед отправкой.
async function makeBigPhoto() {
  const page = await browser.newPage();
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4000;
    canvas.height = 3000;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(4000, 3000);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = (i * 7) % 255;
      image.data[i + 1] = (i * 13) % 251;
      image.data[i + 2] = (i * 17) % 241;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  });
  await page.close();
  return Buffer.from(base64, 'base64');
}
const bigPhoto = await makeBigPhoto();

try {
  const jobId = await dealViaApi('Переписка: полки в прихожей');
  const ownerUrl = `${WEB}/account/jobs/${jobId}`;
  const workUrl = `${WEB}/account/work/${jobId}`;
  const ownerPage = await (await contextFor(owner)).newPage();
  const workerPage = await (await contextFor(contractor)).newPage();
  watch(ownerPage);
  watch(workerPage);

  // --- Заказчик пишет; исполнитель видит сообщение без перезагрузки (автообновление).
  await workerPage.goto(workUrl, { waitUntil: 'networkidle' });
  check(
    'contractor sees an empty conversation',
    await workerPage.locator('#chat').getByText('Сообщений пока нет.').isVisible(),
  );
  await ownerPage.goto(ownerUrl, { waitUntil: 'networkidle' });
  await ownerPage.fill('#chat textarea[name="body"]', 'Добрый день! Когда сможете начать?');
  await ownerPage.locator('#chat').getByRole('button', { name: 'Отправить' }).click();
  await ownerPage.locator('#chat li', { hasText: 'Когда сможете начать?' }).waitFor();
  check(
    'owner sees own message as «Вы»',
    await ownerPage
      .locator('#chat li', { hasText: 'Когда сможете начать?' })
      .getByText('Вы')
      .isVisible(),
  );
  await workerPage
    .locator('#chat li', { hasText: 'Когда сможете начать?' })
    .waitFor({ timeout: 30_000 });
  check('contractor gets the message without reloading', true);

  // --- Исполнитель отвечает с фото: браузер уменьшает его до 2000 px перед отправкой.
  await workerPage.fill('#chat textarea[name="body"]', 'Завтра в 10:00. Вот стена сейчас.');
  await workerPage
    .locator('#chat input[type="file"]')
    .setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: bigPhoto });
  await workerPage.locator('#chat').getByText('Выбрано фото: 1').waitFor();
  const shrunk = await workerPage.evaluate(
    () => document.querySelector('#chat input[type="file"]').files[0].size,
  );
  check('the photo is shrunk in the browser before sending', shrunk < bigPhoto.length, `${shrunk}`);
  await workerPage.locator('#chat').getByRole('button', { name: 'Отправить' }).click();
  const reply = workerPage.locator('#chat li', { hasText: 'Завтра в 10:00' });
  await reply.waitFor();
  const thumb = reply.locator('img');
  await thumb.waitFor();
  const loaded = await thumb.evaluate((img) =>
    img.complete ? img.naturalWidth : new Promise((r) => (img.onload = () => r(img.naturalWidth))),
  );
  check('photo thumbnail loads', loaded > 0 && loaded <= 480, `${loaded}`);
  const { body: chat } = await api(owner, `/v1/jobs/${jobId}/messages`);
  const photo = chat.items.at(-1).photos[0];
  check('stored photo is at most 2000 px', Math.max(photo.width, photo.height) === 2000);
  const full = await ownerPage.request.get(`${WEB}/account/photos/${jobId}/${photo.id}`);
  check(
    'owner opens the full photo',
    full.status() === 200 && full.headers()['content-type'] === 'image/webp',
  );

  // --- Посторонний не видит фото и переписку.
  const strangerPage = await (await contextFor(stranger)).newPage();
  const denied = await strangerPage.request.get(`${WEB}/account/photos/${jobId}/${photo.id}`);
  check('stranger gets 404 for the photo', denied.status() === 404, `${denied.status()}`);

  // --- Сдача этапа с фото-отчётом; заказчик видит фото у этапа.
  await workerPage.goto(workUrl, { waitUntil: 'networkidle' });
  await workerPage.locator('#plan summary', { hasText: 'Этап сдан' }).click();
  await workerPage.fill('#plan textarea[name="comment"]', 'Полки и карниз на месте');
  await workerPage.locator('#plan input[type="file"]').setInputFiles([
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: bigPhoto },
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: bigPhoto },
  ]);
  await workerPage.locator('#plan').getByText('Выбрано фото: 2').waitFor();
  await workerPage.getByRole('button', { name: 'Сдать этап' }).click();
  await workerPage.getByText('Этап сдан, ждём проверки заказчика.').waitFor();
  const { body: plan } = await api(owner, `/v1/jobs/${jobId}/plan`);
  check('stage submitted with two photos', plan.stages[0].photos.length === 2);
  await ownerPage.goto(ownerUrl, { waitUntil: 'networkidle' });
  check(
    'owner sees the photo report at the stage',
    (await ownerPage.locator('#plan ul[aria-label^="Фото-отчёт"] img').count()) === 2,
  );

  // --- Без JS сообщение тоже отправляется.
  {
    const noJs = await (await contextFor(owner, { javaScriptEnabled: false })).newPage();
    await noJs.goto(ownerUrl);
    await noJs.fill('#chat textarea[name="body"]', 'Отправлено без JavaScript');
    await noJs.locator('#chat').getByRole('button', { name: 'Отправить' }).click();
    await noJs.waitForLoadState('load');
    const { body: after } = await api(owner, `/v1/jobs/${jobId}/messages`);
    check(
      'without JS the message is sent',
      after.items.some((m) => m.body === 'Отправлено без JavaScript'),
    );
    await noJs.context().close();
  }

  // --- Ширина 320 px: переписка без горизонтальной прокрутки.
  {
    const narrow = await (
      await contextFor(contractor, { viewport: { width: 320, height: 700 } })
    ).newPage();
    await narrow.goto(workUrl, { waitUntil: 'networkidle' });
    const [scroll, inner] = await narrow.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    check('320 px: work page with the conversation fits', scroll <= inner, `${scroll} > ${inner}`);
    await narrow.context().close();
  }

  // --- Заказ закрыт: переписка только для чтения.
  await api(owner, `/v1/me/jobs/${jobId}/close`, {
    method: 'POST',
    body: { outcome: 'COMPLETED' },
  });
  await workerPage.goto(workUrl, { waitUntil: 'networkidle' });
  check(
    'closed job: conversation is read-only',
    (await workerPage.getByText('Заказ закрыт: переписка только для чтения.').isVisible()) &&
      (await workerPage.locator('#chat textarea[name="body"]').count()) === 0,
  );

  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
} catch (error) {
  check('chat scenario finished', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

checkCsp(check, cspViolations);
finish('chat e2e');
