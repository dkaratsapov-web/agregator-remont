import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Нет подключения' };

/**
 * Офлайн-страница для service worker. Вне группы (site): статичная, без шапки с сессией,
 * потому что открыта без пароля (deploy/Caddyfile).
 */
export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto grid min-h-dvh max-w-2xl place-content-center px-4 text-center"
    >
      <h1 className="text-3xl font-semibold tracking-tight">Нет подключения к интернету</h1>
      <p className="mt-3 text-ink-soft">
        Каталог заказов обновляется онлайн. Проверьте соединение и обновите страницу.
      </p>
    </main>
  );
}
