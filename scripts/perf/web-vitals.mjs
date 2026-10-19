/* global window -- выполняется в браузере через addInitScript и evaluate */
// Замер LCP, CLS, INP и загрузки видео главной (ТЗ #40, п. 8):
//   node scripts/perf/web-vitals.mjs [адрес сайта, по умолчанию http://localhost:3000] [метка]
// Профили Chromium: компьютер без ограничений; телефон 390×844 на «медленном 4G» (задержка
// 150 мс, 1,6 Мбит/с вниз, 0,75 вверх) с процессором в 4 раза медленнее. Медиана из 3 прогонов.
// Метка в выводе (localhost или production) — чтобы не путать замеры: localhost не отражает
// сеть и сервер production. Safari (WebKit) LCP/INP/CLS не отдаёт — его проверяет
// scripts/webkit-e2e.mjs поведенчески.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const LABEL = process.argv[3] ?? (BASE.includes('localhost') ? 'localhost' : 'production');
const RUNS = 3;

const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, network: null, cpu: 1 },
  'mobile-slow-4g': {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    network: { latency: 150, downloadThroughput: 200_000, uploadThroughput: 94_000 },
    cpu: 4,
  },
};

const pages = [
  // Главная: LCP — постер первого кадра или заголовок; взаимодействие — «Как это работает».
  { path: '/', interact: (p) => p.locator('a[href="#how-it-works"]').first().click() },
  { path: '/jobs', interact: (p) => p.locator('input[name="q"]').last().click() },
];

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const rows = [];
try {
  for (const [name, profile] of Object.entries(profiles)) {
    for (const { path, interact } of pages) {
      const runs = [];
      for (let i = 0; i < RUNS; i += 1) {
        const context = await browser.newContext({
          viewport: profile.viewport,
          isMobile: profile.isMobile,
          hasTouch: profile.hasTouch,
        });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        if (profile.network) {
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            ...profile.network,
          });
        }
        if (profile.cpu > 1)
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        // Фактически полученные байты видео (а не объявленный размер файла).
        const media = new Set();
        let videoBytes = 0;
        cdp.on('Network.responseReceived', (e) => {
          if (/\.(mp4|webm)(\?|$)/.test(e.response.url)) media.add(e.requestId);
        });
        cdp.on('Network.dataReceived', (e) => {
          if (media.has(e.requestId)) videoBytes += e.encodedDataLength || e.dataLength;
        });
        await page.addInitScript(() => {
          window.__v = { lcp: 0, cls: 0, inp: 0, lcpEl: '' };
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) {
              window.__v.lcp = e.startTime;
              window.__v.lcpEl = e.element ? e.element.tagName.toLowerCase() : '';
            }
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) if (!e.hadRecentInput) window.__v.cls += e.value;
          }).observe({ type: 'layout-shift', buffered: true });
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) {
              if (e.interactionId) window.__v.inp = Math.max(window.__v.inp, e.duration);
            }
          }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
        });
        const started = Date.now();
        await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120_000 });
        const loadMs = Date.now() - started;
        await page.waitForTimeout(4000);
        await interact(page).catch(() => undefined);
        await page.waitForTimeout(1000);
        const v = await page.evaluate(() => window.__v);
        runs.push({ ...v, loadMs, videoKb: Math.round(videoBytes / 1024) });
        await context.close();
      }
      const row = {
        label: LABEL,
        profile: name,
        path,
        lcp: Math.round(median(runs.map((r) => r.lcp))),
        lcpEl: runs[0].lcpEl,
        cls: median(runs.map((r) => r.cls)).toFixed(3),
        inp: Math.round(median(runs.map((r) => r.inp))),
        load: Math.round(median(runs.map((r) => r.loadMs))),
        videoKb: median(runs.map((r) => r.videoKb)),
      };
      rows.push(row);
      console.log(
        `${row.label} ${row.profile} ${row.path}: LCP ${row.lcp} мс (${row.lcpEl}), CLS ${row.cls}, INP ${row.inp} мс, load ${row.load} мс, видео получено за ~5 с: ${row.videoKb} КБ`,
      );
    }
  }
} finally {
  await browser.close();
}
