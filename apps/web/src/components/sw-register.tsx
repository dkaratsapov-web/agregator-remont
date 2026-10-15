'use client';

import { useEffect } from 'react';

/** Service worker регистрируется только в production-сборке. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Сайт полностью работает и без SW; ошибку регистрации не показываем пользователю.
    });
  }, []);
  return null;
}
