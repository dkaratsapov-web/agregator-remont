/* global document, window -- выполняется в браузере через evaluate */
// Модерация в настоящем браузере (фаза 2): жалоба на заказ в каталоге и на сообщение в
// переписке, очередь администратора, скрытие сообщения и заказа, блокировка автора (выход
// из всех сеансов, вход — с понятным отказом), закрытие жалобы; жалоба на отклик без JS;
// страница жалоб на 320 px. Администратор назначается прямо в базе (DATABASE_URL), как в тестах API.
// Требует запущенные API и web (production-сборка), как chat-e2e.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';

const { check, finish } = createChecker();
// Уникальные названия: карточки жалоб ищутся по заказу, прежние прогоны не мешают.
const RUN = Date.now().toString(36);
const owner = await registerViaApi('CUSTOMER');
const contractor = await registerViaApi('CONTRACTOR');
const reporter = await registerViaApi('CONTRACTOR');
const admin = await registerViaApi('CUSTOMER');

// Роль администратора выдаётся только миграцией; в тесте — прямо в базе.
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
      description: 'Положить ламинат в комнате, подложка куплена.',
      category: 'FLOORING',
      details: { covering: 'laminate', area: 14 },
      city: 'Москва',
    },
  });
  return body.id;
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

/** Отправить форму «Пожаловаться» внутри области. */
async function report(scope, reason, comment = '') {
  await scope.getByText('Пожаловаться', { exact: true }).click();
  await scope.getByLabel(reason).check();
  if (comment) await scope.getByLabel(/Пояснение/).fill(comment);
  await scope.getByRole('button', { name: 'Отправить жалобу' }).click();
}

/** Действие модератора в карточке жалобы: раскрыть, пояснение, кнопка. */
async function moderate(card, summary, text, button = summary) {
  await card.locator('summary', { hasText: summary }).click();
  const form = card.locator('details[open] form');
  await form.locator('textarea').fill(text);
  await form.getByRole('button', { name: button }).click();
}

try {
  const jobTitle = `Модерация ${RUN}: ламинат в комнате`;
  const jobId = await openJob(jobTitle);
  const { body: bid } = await api(contractor, `/v1/jobs/${jobId}/bids`, {
    method: 'POST',
    body: { price: 18_000, durationDays: 2, comment: 'Уложу за два дня.' },
  });
  await api(owner, `/v1/me/jobs/${jobId}/bids/${bid.id}/accept`, { method: 'POST' });
  await api(contractor, `/v1/jobs/${jobId}/messages`, {
    method: 'POST',
    body: { body: 'Переведите предоплату 50% на карту, иначе не начну.' },
  });

  // --- Жалоба на заказ из карточки в каталоге (чужой заказ).
  const reporterPage = await (await contextFor(reporter)).newPage();
  watch(reporterPage);
  await reporterPage.goto(`${WEB}/jobs/${jobId}`, { waitUntil: 'networkidle' });
  await report(reporterPage.locator('aside'), 'Ненастоящий заказ или отклик');
  await reporterPage.getByText('Жалоба отправлена. Администратор разберёт её.').waitFor();
  check('reporter sends a complaint about a job from the catalog', true);

  // --- Жалоба заказчика на сообщение исполнителя в переписке.
  const ownerPage = await (await contextFor(owner)).newPage();
  watch(ownerPage);
  await ownerPage.goto(`${WEB}/account/jobs/${jobId}`, { waitUntil: 'networkidle' });
  const message = ownerPage.locator('#chat li', { hasText: 'Переведите предоплату' });
  check(
    'own messages have no report button, others do',
    (await message.getByText('Пожаловаться', { exact: true }).count()) === 1,
  );
  await report(message, 'Мошенничество, просят предоплату', 'Требует предоплату на карту');
  await message.getByText('Жалоба отправлена. Администратор разберёт её.').waitFor();
  check('owner reports a message in the conversation', true);

  // --- Очередь администратора.
  const adminPage = await (await contextFor(admin)).newPage();
  watch(adminPage);
  const cards = adminPage.locator('main ul > li').filter({ hasText: jobTitle });
  // Очередь — старые первыми, по 20 на страницу: в базе, где уже есть открытые жалобы
  // (повторный прогон, стенд), свои могут оказаться дальше первой страницы.
  for (let page = 1; page <= 10; page += 1) {
    await adminPage.goto(`${WEB}/admin/reports${page > 1 ? `?page=${page}` : ''}`, {
      waitUntil: 'networkidle',
    });
    if ((await cards.count()) > 0) break;
  }
  check('admin sees both complaints in the queue', (await cards.count()) === 2);
  const onMessage = cards.filter({ hasText: 'Сообщение: Мошенничество' });
  check(
    'the complaint shows the message, the comment and the author',
    (await onMessage.textContent()).includes('Переведите предоплату 50%') &&
      (await onMessage.textContent()).includes('Требует предоплату на карту'),
  );

  // Скрыть сообщение → заблокировать автора → закрыть жалобу.
  await moderate(onMessage, 'Скрыть сообщение', 'Просьба о предоплате в обход сервиса');
  await cards
    .filter({ hasText: 'Сообщение: Мошенничество' })
    .getByText('Сообщение скрыто', { exact: true })
    .waitFor();
  await moderate(
    cards.filter({ hasText: 'Сообщение: Мошенничество' }),
    'Заблокировать автора',
    'Мошенничество с предоплатой',
    'Заблокировать',
  );
  await cards
    .filter({ hasText: 'Сообщение: Мошенничество' })
    .getByText('Заблокирован', { exact: true })
    .waitFor();
  await moderate(
    cards.filter({ hasText: 'Сообщение: Мошенничество' }),
    'Закрыть жалобу',
    'Сообщение скрыто, исполнитель заблокирован',
    'Меры приняты',
  );
  await cards
    .filter({ hasText: 'Сообщение: Мошенничество' })
    .first()
    .waitFor({ state: 'detached' });
  check('a resolved complaint leaves the open queue', true);

  // --- Последствия: сообщение скрыто у заказчика, исполнитель вышел и не может войти.
  await ownerPage.reload({ waitUntil: 'networkidle' });
  check(
    'the hidden message shows a moderator note instead of the text',
    (await ownerPage.locator('#chat').getByText('Сообщение скрыто модератором.').isVisible()) &&
      (await ownerPage.locator('#chat').getByText('Переведите предоплату').count()) === 0,
  );
  const contractorPage = await (await contextFor(contractor)).newPage();
  watch(contractorPage);
  await contractorPage.goto(`${WEB}/account`, { waitUntil: 'networkidle' });
  check('the blocked user is signed out', contractorPage.url().includes('/login'));
  await contractorPage.fill('input[name="email"]', contractor.user.email);
  await contractorPage.fill('input[name="password"]', 'integration-password-123');
  await contractorPage.getByRole('button', { name: 'Войти', exact: true }).click();
  await contractorPage.getByText(/заблокирован администратором/).waitFor();
  check('signing in tells the user the account is blocked', true);

  // --- Скрыть заказ по жалобе: в каталоге его нет, владелец видит пометку.
  const onJob = cards.filter({ hasText: 'Заказ: Ненастоящий' });
  await moderate(onJob, 'Скрыть заказ', 'Проверка: заказ скрыт по жалобе');
  // Внутри своей карточки: в очереди могут быть скрытые заказы прежних прогонов.
  await cards
    .filter({ hasText: 'Заказ: Ненастоящий' })
    .getByText('Заказ скрыт', { exact: true })
    .waitFor();
  const gone = await reporterPage.goto(`${WEB}/jobs/${jobId}`);
  check('a hidden job is gone from the catalog', gone.status() === 404, `${gone.status()}`);
  await ownerPage.reload({ waitUntil: 'networkidle' });
  check(
    'the owner sees that the job is hidden',
    await ownerPage.getByText(/Заказ скрыт модератором/).isVisible(),
  );

  // --- Без JS: заказчик жалуется на отклик к другому заказу.
  {
    const second = await openJob(`Модерация ${RUN}: второй заказ`);
    await api(reporter, `/v1/jobs/${second}/bids`, {
      method: 'POST',
      body: { price: 9_000, durationDays: 1, comment: 'Звоните на мой номер, договоримся.' },
    });
    const noJs = await (await contextFor(owner, { javaScriptEnabled: false })).newPage();
    await noJs.goto(`${WEB}/account/jobs/${second}`);
    const row = noJs.locator('#bids li').first();
    await row.getByText('Пожаловаться', { exact: true }).click();
    await row.getByLabel('Спам или реклама').check();
    await row.getByRole('button', { name: 'Отправить жалобу' }).click();
    await noJs.waitForURL(/report=sent/);
    check(
      'without JS the page says the complaint was sent',
      await noJs.getByText('Жалоба отправлена. Администратор разберёт её.').isVisible(),
    );
    // Все жалобы — новые первыми: своя на первой странице, сколько бы открытых ни было в базе.
    const { body: queue } = await api(admin, '/v1/admin/reports?status=ALL');
    check(
      'without JS a complaint about a bid is sent',
      queue.items.some((r) => r.targetType === 'BID' && r.subject.jobId === second),
    );
    await noJs.context().close();
  }

  // --- 320 px: страница жалоб без горизонтальной прокрутки.
  {
    const narrow = await (
      await contextFor(admin, { viewport: { width: 320, height: 700 } })
    ).newPage();
    await narrow.goto(`${WEB}/admin/reports?status=ALL`, { waitUntil: 'networkidle' });
    const [scroll, inner] = await narrow.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    check('320 px: admin reports page fits', scroll <= inner, `${scroll} > ${inner}`);
    await narrow.context().close();
  }

  check('no JavaScript errors', errors.length === 0, errors.join(' | '));
} catch (error) {
  check(
    'moderation scenario finished',
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  await browser.close();
}

finish('moderation e2e');
