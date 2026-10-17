/*
 * Минимальный service worker: кэширует только офлайн-страницу.
 * Данные заказов и HTML не кэшируются, чтобы не показывать устаревшие цены и статусы.
 */
const CACHE = 'agregator-offline-v2';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/*
 * Навигация (GET): запрос идёт в сеть через SW.
 * - Сетевая ошибка (сервер недоступен, DNS, «Wi-Fi без интернета») → офлайн-страница. На
 *   navigator.onLine не опираемся: он бывает true без доступа к сайту.
 * - Ответ 401 (закрытая паролем часть, deploy/Caddyfile): на fetch из SW браузер не показывает
 *   диалог пароля. Поэтому запоминаем адрес и отдаём страницу, которая сразу перезагружает его;
 *   повторную навигацию на этот адрес SW пропускает мимо себя, и браузер сам спрашивает пароль.
 *   Метка живёт несколько секунд в памяти SW.
 * Остальные запросы (не GET, не навигация) SW не трогает.
 */
const BYPASS_MS = 10_000;
const bypass = new Map();

const RELOAD_PAGE =
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0">' +
  '<title>Вход</title><p>Нужен вход. Если страница не обновилась, обновите её вручную.</p>';

function offlineResponse() {
  return caches.match(OFFLINE_URL).then((res) => res || Response.error());
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;

  const until = bypass.get(request.url);
  if (until !== undefined) {
    bypass.delete(request.url);
    if (until > Date.now()) return;
  }

  event.respondWith(
    fetch(request).then(
      (res) => {
        if (res.status !== 401) return res;
        bypass.set(request.url, Date.now() + BYPASS_MS);
        return new Response(RELOAD_PAGE, {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      },
      () => offlineResponse(),
    ),
  );
});
