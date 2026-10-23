// Автоматическая проверка доступности axe-core (WCAG 2.1 A и AA) по ключевым страницам: гость,
// заказчик в светлой и тёмной теме, мастер (docs/audit/UX_NO_JS_A11Y.md). Падает на нарушениях
// уровня serious и critical. Требует запущенные API и web.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { API, WEB, createChecker, registerViaApi } from './lib/forms.mjs';

const { check, finish } = createChecker();
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const api = async (who, path, method, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { ...who.auth, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
};

const customer = await registerViaApi('CUSTOMER');
const dark = await registerViaApi('CUSTOMER');
const master = await registerViaApi('CONTRACTOR');
await api(dark, '/v1/me/preferences', 'PATCH', { theme: 'dark' });
const job = await api(customer, '/v1/me/jobs', 'POST', {
  title: 'Ламинат в комнате для проверки доступности',
  description: 'Уложить ламинат в комнате, подложка и плинтус уже куплены.',
  category: 'FLOORING',
  details: { covering: 'laminate', area: 20 },
  city: 'Москва',
});
await api(master, '/v1/me/profile', 'PUT', {
  about: 'Укладываю ламинат и паркет.',
  categories: ['FLOORING'],
  cities: ['Москва'],
});
const { publicId } = await api(master, '/v1/me', 'GET');

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const host = new URL(WEB).hostname;
async function scan(who, path, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  if (who) {
    await context.addCookies(
      who.cookie.split('; ').map((pair) => {
        const [name, value] = pair.split('=');
        return { name, value, domain: host, path: '/', secure: name.startsWith('__Host-') };
      }),
    );
  }
  const page = await context.newPage();
  // Не networkidle: на главной видео грузится частями.
  await page.goto(WEB + path, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(() =>
    // eslint-disable-next-line no-undef -- axe добавлен на страницу выше
    axe.run(
      // Слова манифеста нарочно бледные до прокрутки (при «меньше движения» — сразу полные,
      // это проверяется отдельным прогоном главной ниже).
      { exclude: [['[data-scroll-reveal]']] },
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } },
    ),
  );
  await context.close();
  return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

const PAGES = [
  ['guest', null, '/', {}],
  ['guest, reduced motion', null, '/', { reducedMotion: 'reduce' }],
  ['guest', null, '/jobs', {}],
  ['guest', null, `/jobs/${job.id}`, {}],
  ['guest', null, '/login', {}],
  ['guest', null, '/register', {}],
  ['guest', null, '/privacy', {}],
  ['guest', null, `/contractors/${publicId}`, {}],
  ['customer', customer, '/account', {}],
  ['customer', customer, '/account/jobs', {}],
  ['customer', customer, '/account/jobs/new', {}],
  ['customer', customer, `/account/jobs/${job.id}`, {}],
  ['customer', customer, '/account/settings', {}],
  ['customer', customer, '/account/notifications', {}],
  ['customer, dark', dark, '/account', {}],
  ['customer, dark', dark, '/account/jobs/new', {}],
  ['customer, dark', dark, '/account/settings', {}],
  ['contractor', master, '/account/bids', {}],
  ['contractor', master, '/account/profile', {}],
];

try {
  for (const [who, actor, path, options] of PAGES) {
    const violations = await scan(actor, path, options);
    check(
      `${who}: ${path.replace(job.id, ':id').replace(String(publicId), ':publicId')} has no serious a11y violations`,
      violations.length === 0,
      violations
        .map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(', ')}`,
        )
        .join('; '),
    );
  }
} finally {
  await browser.close();
}
finish('accessibility e2e');
