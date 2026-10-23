// Оценка цены в форме заказа (docs/PRICE_ESTIMATES.md): заказы и отклики через API, затем
// черновик в настоящем браузере — подсказка под бюджетом с JS и без, нет подсказки для заказа
// из нескольких работ. Требует запущенные API и web.
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';
import { checkCsp, watchCsp } from './lib/csp-watch.mjs';

const { check, finish } = createChecker();
const shared = await import(new URL('../packages/shared/dist/index.js', import.meta.url).href);

const api = async (who, path, init = {}) => {
  const res = await fetch(API + path, {
    ...init,
    headers: { ...who.auth, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const owner = await registerViaApi('CUSTOMER');
const masters = [];
for (let i = 0; i < 3; i += 1) masters.push(await registerViaApi('CONTRACTOR'));

// Три заказа, три мастера, пять откликов: этого хватает для оценки (PRICE_ESTIMATE).
const jobs = [];
for (let i = 0; i < 3; i += 1) {
  const { status, body } = await api(owner, '/v1/me/jobs', {
    method: 'POST',
    body: {
      title: `Ламинат в комнате ${i + 1}`,
      description: 'Уложить ламинат в комнате, подложка и плинтус уже куплены.',
      category: 'FLOORING',
      details: { covering: 'laminate', area: 20 },
      city: 'Москва',
    },
  });
  if (status !== 201) throw new Error(`job -> ${status}`);
  jobs.push(body.id);
}
for (const [jobIndex, masterIndex, price] of [
  [0, 0, 20_000],
  [0, 1, 30_000],
  [1, 0, 25_000],
  [1, 2, 35_000],
  [2, 1, 40_000],
]) {
  const { status } = await api(masters[masterIndex], `/v1/jobs/${jobs[jobIndex]}/bids`, {
    method: 'POST',
    body: { price, durationDays: 3, comment: 'Уложу аккуратно, инструмент свой.' },
  });
  if (status !== 201) throw new Error(`bid -> ${status}`);
}

const draft = async (body) => {
  const { status, body: created } = await api(owner, '/v1/me/drafts', { method: 'POST', body });
  if (status !== 201) throw new Error(`draft -> ${status}`);
  return created.id;
};
const single = await draft({
  title: 'Ламинат на кухне',
  category: 'FLOORING',
  city: 'Москва',
  details: { covering: 'laminate', area: 20 },
});
const several = await draft({
  title: 'Пол и плитка',
  category: 'FLOORING',
  city: 'Москва',
  extraItems: [{ category: 'TILING', details: {} }],
});

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const cspViolations = watchCsp(browser);
const host = new URL(WEB).hostname;
const contextFor = async (options = {}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ...options });
  await context.addCookies(
    owner.cookie.split('; ').map((pair) => {
      const [name, value] = pair.split('=');
      return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
    }),
  );
  return context;
};
const label = shared.JOB_CATEGORY_LABELS.FLOORING;

try {
  for (const [name, options] of [
    ['with JS', {}],
    ['without JS', { javaScriptEnabled: false }],
  ]) {
    const page = await (await contextFor(options)).newPage();
    await page.goto(`${WEB}/account/jobs/new?draft=${single}`, { waitUntil: 'networkidle' });
    const hint = page.getByTestId('price-estimate');
    const text = (await hint.textContent().catch(() => '')) ?? '';
    check(`${name}: the estimate is under the budget`, text.includes('Мастера на сервисе'), text);
    check(`${name}: it names the category`, text.includes(`«${label}»`), text);
    // У заказов сценария площадь 20 м²: есть цена за м² и сумма для площади черновика.
    const plain = text.replace(/\u00a0|\u202f/g, ' ');
    check(`${name}: price per m² for the draft area`, /За м².*для ваших 20 м²/.test(plain), plain);
    check(`${name}: no ids or names in the hint`, !masters.some((m) => text.includes(m.user.name)));

    await page.goto(`${WEB}/account/jobs/new?draft=${several}`, { waitUntil: 'networkidle' });
    check(
      `${name}: no estimate for a job of several works`,
      (await page.getByTestId('price-estimate').count()) === 0,
    );
  }
} finally {
  await browser.close();
}

checkCsp(check, cspViolations);
finish('price estimate e2e');
