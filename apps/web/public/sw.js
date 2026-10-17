/*
 * Минимальный service worker: кэширует только офлайн-страницу.
 * Данные заказов и HTML не кэшируются, чтобы не показывать устаревшие цены и статусы.
 */
const CACHE = 'agregator-offline-v1';
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

// Онлайн навигация идёт мимо SW: так браузер сам показывает запрос пароля basic auth для
// закрытой части сайта (ответ 401 на fetch из SW диалог не вызывает). Офлайн — офлайн-страница.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || self.navigator.onLine) return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((res) => res || Response.error()),
    ),
  );
});
