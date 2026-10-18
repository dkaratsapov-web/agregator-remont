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
 * Навигация (GET): запрос идёт в сеть через SW. Сетевая ошибка (сервер недоступен, DNS,
 * «Wi-Fi без интернета») → офлайн-страница. На navigator.onLine не опираемся: он бывает true без
 * доступа к сайту. Переход на страницу входа тестировщика (/gate, deploy/Caddyfile) — обычный
 * редирект, браузер выполняет его сам. Остальные запросы (не GET, не навигация) SW не трогает.
 */
function offlineResponse() {
  return caches.match(OFFLINE_URL).then((res) => res || Response.error());
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  event.respondWith(fetch(request).catch(() => offlineResponse()));
});
