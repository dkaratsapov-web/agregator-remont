import Link from 'next/link';

export function ContractorsOnly() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Раздел для подрядчиков</h1>
      <p className="mt-3 text-ink-soft">
        Профиль и отклики доступны подрядчикам. Заказчики публикуют заказы в кабинете.
      </p>
      <Link
        href="/account"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-hover"
      >
        В кабинет
      </Link>
    </div>
  );
}
