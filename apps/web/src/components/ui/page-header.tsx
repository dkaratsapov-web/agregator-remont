import Link from 'next/link';

/** Основная кнопка-ссылка кабинета: «Новый заказ», «Найти заказ». */
export const primaryLinkClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-ink transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.97]';

/** Второстепенная кнопка-ссылка: рамка вместо заливки. */
export const secondaryLinkClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-ink transition-[border-color,transform] duration-150 hover:border-ink/30 active:scale-[0.97]';

/**
 * Шапка страницы кабинета: обратная ссылка, заголовок, пояснение и главное действие. Под
 * шапкой — линия на всю ширину, как граница листа.
 */
export function PageHeader({
  back,
  title,
  description,
  action,
  children,
}: {
  back?: { href: string; label: string };
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Строка под заголовком: номер аккаунта, статус заказа. */
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-line pb-6">
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="group -ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-[7px] px-1 text-sm text-ink-soft transition-colors duration-150 hover:text-ink"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M10 3.5 5.5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {back.label}
          </Link>
        ) : null}
        <h1 className="mt-1 font-display text-[1.65rem] font-semibold leading-[1.15] tracking-[-0.025em] text-ink [overflow-wrap:break-word] [text-wrap:balance] sm:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-[62ch] text-ink-soft [text-wrap:pretty]">{description}</p>
        ) : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </header>
  );
}

/** Пустое состояние внутри листа: что здесь появится и что сделать первым. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center sm:px-6">
      <p className="text-base font-semibold text-ink">{title}</p>
      {children ? (
        <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-ink-soft [text-wrap:pretty]">
          {children}
        </p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
