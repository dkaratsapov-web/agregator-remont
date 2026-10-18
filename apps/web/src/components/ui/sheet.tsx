import Link from 'next/link';

/**
 * Лист кабинета: поверхность с тонкой рамкой, шапка отделена линией, как заголовок листа в
 * рабочей документации. Без теней: иерархию задают рамка, линии и типографика.
 */
export function Sheet({
  children,
  className = '',
  labelledBy,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`overflow-hidden rounded-[14px] border border-line bg-surface ${className}`}
    >
      {children}
    </section>
  );
}

export function SheetHeader({
  id,
  title,
  description,
  marker,
  action,
}: {
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Номер шага: только когда листы действительно идут по порядку. */
  marker?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-start gap-3.5">
        {marker !== undefined ? (
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-[7px] border-[1.5px] border-ink font-display text-[13px] font-semibold tabular-nums text-ink"
          >
            {marker}
          </span>
        ) : null}
        <div className="min-w-0 pt-0.5">
          <h2 id={id} className="text-lg font-semibold leading-7 tracking-tight text-ink">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 max-w-[60ch] text-sm text-ink-soft">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
    </div>
  );
}

export function SheetBody({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`px-5 py-4 sm:px-6 sm:py-5 ${className}`}>{children}</div>;
}

/** Ссылка в шапке листа: «Все заказы», «Изменить». */
export function SheetLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center rounded-[8px] px-2.5 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-4 transition-colors duration-150 hover:decoration-accent"
    >
      {children}
    </Link>
  );
}

/** Ведомость: строки листа, разделённые тонкими линиями. */
export function Ledger({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line">
      {children}
    </ul>
  );
}

/**
 * Строка ведомости со ссылкой: слева название и подробности, справа сумма и статус. При
 * наведении строка подсвечивается, слева появляется метка — видно, куда ведёт клик.
 */
export function LedgerLink({
  href,
  title,
  meta,
  aside,
}: {
  href: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group relative flex flex-col gap-2 px-5 py-3.5 transition-colors duration-150 hover:bg-canvas sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-[3px] origin-center scale-y-0 rounded-r-[2px] bg-accent transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-y-100"
        />
        <span className="min-w-0">
          <span className="block font-semibold text-ink [overflow-wrap:anywhere]">{title}</span>
          {meta ? <span className="mt-0.5 block text-sm text-ink-soft">{meta}</span> : null}
        </span>
        {aside ? <span className="flex shrink-0 items-center gap-3">{aside}</span> : null}
      </Link>
    </li>
  );
}

const pagerLinkClass =
  'inline-flex min-h-9 items-center rounded-[8px] px-2 text-ink underline decoration-ink/25 underline-offset-4 transition-colors duration-150 hover:decoration-accent';

/** Переключатель страниц в нижней строке листа. */
export function SheetPager({
  href,
  page,
  totalPages,
}: {
  /** Адрес списка без параметра page. */
  href: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const to = (n: number) => (n > 1 ? `${href}?page=${n}` : href);
  return (
    <nav
      aria-label="Страницы"
      className="flex items-center justify-between border-t border-line px-5 py-2.5 text-sm font-semibold sm:px-6"
    >
      {page > 1 ? (
        <Link href={to(page - 1)} className={pagerLinkClass}>
          Назад
        </Link>
      ) : (
        <span />
      )}
      <span className="font-normal tabular-nums text-ink-soft">
        Страница {page} из {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={to(page + 1)} className={pagerLinkClass}>
          Вперёд
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
