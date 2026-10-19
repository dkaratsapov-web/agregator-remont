/* global window, document, requestAnimationFrame -- выполняется в браузере через addInitScript и evaluate */
// Видео первого экрана главной на разных сетях (ТЗ #42, п. 6):
//   node scripts/perf/landing-video.mjs [адрес сайта, по умолчанию http://localhost:3000] [метка]
// Профили Chromium: компьютер без ограничений; телефон 390×844 (процессор в 4 раза медленнее) на
// 4G (9 Мбит/с, 60 мс), медленном 4G (1,6 Мбит/с, 150 мс), 3G (0,4 Мбит/с, 400 мс), с
// «экономией трафика» (saveData) и с «меньше движения». Для каждого: LCP и его элемент, CLS, INP
// (нажатие «Как это работает»), событие load, когда на экране первый кадр видео (а не постер),
// сколько байт прямого и обратного ролика пришло за первые WATCH_MS на первом экране, затем
// прокрутка вниз и обратно вверх — показывался ли обратный ролик и были ли ошибки JS.
// Медиана из RUNS прогонов. Метка в выводе (localhost или production): localhost не отражает
// сервер и сеть production — только ограничения, заданные здесь. Safari (WebKit) LCP/INP/CLS не
// отдаёт; реальный iPhone — задача владельца.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const LABEL = process.argv[3] ?? (BASE.includes('localhost') ? 'localhost' : 'production');
const RUNS = Number(process.env.RUNS ?? 3);
const WATCH_MS = Number(process.env.WATCH_MS ?? 20_000);

const mbit = (value) => Math.round((value * 1_000_000) / 8);
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4 };
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, cpu: 1 },
  'phone-4g': { ...phone, network: { latency: 60, down: 9, up: 1.5 } },
  'phone-slow-4g': { ...phone, network: { latency: 150, down: 1.6, up: 0.75 } },
  'phone-3g': { ...phone, network: { latency: 400, down: 0.4, up: 0.4 } },
  'phone-slow-4g-savedata': {
    ...phone,
    network: { latency: 150, down: 1.6, up: 0.75 },
    saveData: true,
  },
  'phone-slow-4g-reduced-motion': {
    ...phone,
    network: { latency: 150, down: 1.6, up: 0.75 },
    reducedMotion: 'reduce',
  },
};

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measure(profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    reducedMotion: profile.reducedMotion ?? 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (profile.network) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.network.latency,
      downloadThroughput: mbit(profile.network.down),
      uploadThroughput: mbit(profile.network.up),
    });
  }
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  // Фактически полученные байты роликов по направлению.
  const media = new Map();
  const bytes = { forward: 0, reverse: 0 };
  cdp.on('Network.responseReceived', (e) => {
    const found = /-(forward|reverse)\.(mp4|webm)(\?|$)/.exec(e.response.url);
    if (found) media.set(e.requestId, found[1]);
  });
  cdp.on('Network.dataReceived', (e) => {
    const direction = media.get(e.requestId);
    if (direction) bytes[direction] += e.encodedDataLength || e.dataLength;
  });
  await page.addInitScript((saveData) => {
    if (saveData) {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { saveData: true, effectiveType: '4g' },
      });
    }
    window.__v = {
      lcp: 0,
      cls: 0,
      inp: 0,
      lcpEl: '',
      firstFrame: 0,
      reverseShown: false,
      shifts: [],
      ect: navigator.connection?.effectiveType ?? '',
    };
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__v.lcp = e.startTime;
        window.__v.lcpEl = e.element
          ? `${e.element.tagName.toLowerCase()}${e.element.currentSrc ? ` ${e.element.currentSrc.split('/').pop()}` : ''}`
          : '';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__v.cls += e.value;
        const node = e.sources?.[0]?.node;
        window.__v.shifts.push(
          `${e.value.toFixed(3)} ${node?.nodeName?.toLowerCase() ?? '?'}${node?.className ? `.${String(node.className).split(' ')[0]}` : ''} @${Math.round(e.startTime)}`,
        );
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.interactionId) window.__v.inp = Math.max(window.__v.inp, e.duration);
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    // Первый кадр видео на экране: прямой ролик стал непрозрачным; обратный — показывался ли.
    const watch = () => {
      const videos = document.querySelectorAll('video');
      for (const video of videos) {
        if (video.style.opacity !== '1') continue;
        if (/forward/.test(video.currentSrc) && !window.__v.firstFrame)
          window.__v.firstFrame = performance.now();
        if (/reverse/.test(video.currentSrc)) window.__v.reverseShown = true;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }, profile.saveData === true);

  const started = Date.now();
  await page.goto(BASE, { waitUntil: 'load', timeout: 180_000 });
  const loadMs = Date.now() - started;
  await page.waitForTimeout(WATCH_MS);
  const firstScreen = { ...bytes };
  await page
    .locator('a[href="#how-it-works"]')
    .first()
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(1500);
  // Вниз до первого шага и обратно вверх: на обычной сети вверх играет обратный ролик.
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(4000);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(4000);
  const v = await page.evaluate(() => window.__v);
  await context.close();
  return {
    ...v,
    loadMs,
    forwardKb: Math.round(firstScreen.forward / 1024),
    reverseKb: Math.round(firstScreen.reverse / 1024),
    reverseTotalKb: Math.round(bytes.reverse / 1024),
    errors: errors.length,
  };
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
try {
  const notes = [];
  console.log(
    `| ${LABEL} | LCP, мс (элемент) | CLS | INP, мс | load, мс | первый кадр видео, мс | видео за ${WATCH_MS / 1000} с: прямой / обратный, КБ | обратный ролик показан | ошибки JS |`,
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [name, profile] of Object.entries(profiles)) {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) runs.push(await measure(profile));
    const pick = (key) => median(runs.map((r) => r[key]));
    const frame = pick('firstFrame');
    console.log(
      `| ${name} (ECT ${runs[0].ect || '—'}) | ${Math.round(pick('lcp'))} (${runs[0].lcpEl}) | ${pick('cls').toFixed(3)} | ${Math.round(pick('inp'))} | ${pick('loadMs')} | ${frame ? Math.round(frame) : 'не показан'} | ${pick('forwardKb')} / ${pick('reverseKb')} | ${runs.filter((r) => r.reverseShown).length} из ${RUNS} | ${runs.reduce((n, r) => n + r.errors, 0)} |`,
    );
    const shifts = runs.flatMap((r) => r.shifts);
    if (shifts.length) notes.push(`${name}: сдвиги ${shifts.slice(0, 6).join(', ')}`);
  }
  for (const note of notes) console.log(note);
} finally {
  await browser.close();
}
