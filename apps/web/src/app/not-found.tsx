import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <p className="text-sm font-semibold tabular-nums text-accent">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Страница не найдена</h1>
      <p className="mt-3 text-ink-soft">Возможно, заказ снят с публикации или в адресе опечатка.</p>
      <Link
        href="/jobs"
        className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-accent px-6 font-semibold text-accent-ink hover:bg-accent-hover"
      >
        Открыть каталог
      </Link>
    </div>
  );
}
