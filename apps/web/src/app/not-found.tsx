import Link from 'next/link';

/** Неизвестный адрес: страница вне групп, поэтому без шапки приложения (она читает сессию). */
export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto grid min-h-dvh max-w-2xl place-content-center px-4 text-center"
    >
      <p className="text-sm font-semibold tabular-nums text-accent">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Страница не найдена</h1>
      <p className="mt-3 text-ink-soft">Проверьте адрес или вернитесь на главную.</p>
      <Link
        href="/"
        className="mx-auto mt-8 inline-flex min-h-12 items-center rounded-xl bg-accent px-6 font-semibold text-accent-ink hover:bg-accent-hover"
      >
        На главную
      </Link>
    </main>
  );
}
