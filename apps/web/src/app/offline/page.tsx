import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Нет подключения' };

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Нет подключения к интернету</h1>
      <p className="mt-3 text-ink-soft">
        Каталог заказов обновляется онлайн. Проверьте соединение и обновите страницу.
      </p>
    </div>
  );
}
