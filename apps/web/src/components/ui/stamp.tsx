/**
 * Штамп — как основная надпись на строительном чертеже: заголовок, строки «название —
 * значение» и нижняя строка. Толстая внешняя рамка, тонкие внутренние линии. Сводка заказа,
 * аккаунта: то, что важно увидеть сразу.
 */
export function Stamp({
  label,
  title,
  rows,
  footer,
  ariaLabel,
  aside,
}: {
  /** Короткая подпись над заголовком: «Заказ», «Аккаунт». */
  label: string;
  title: React.ReactNode;
  rows: [string, React.ReactNode][];
  /** Нижняя строка слева (состояние, ссылка); справа всегда марка «Гарантыч». */
  footer?: React.ReactNode;
  ariaLabel: string;
  /** Элемент справа от заголовка (например, фото). */
  aside?: React.ReactNode;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className="overflow-hidden rounded-[6px] border-[1.5px] border-ink bg-surface text-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-ink/20 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-soft">{label}</p>
          <div className="mt-0.5 font-display text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
            {title}
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <dl className="grid grid-cols-[7.25rem_minmax(0,1fr)]">
        {rows.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="border-b border-r border-ink/15 px-4 py-2.5 text-xs leading-5 text-ink-soft">
              {name}
            </dt>
            <dd className="border-b border-ink/15 px-3 py-2.5 font-medium leading-5 text-ink [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-[minmax(0,1fr)_auto]">
        <div className="border-r border-ink/15 px-4 py-2.5 text-xs leading-5 text-ink-soft">
          {footer}
        </div>
        <p className="px-3 py-2.5 font-display text-[11px] font-semibold leading-5 tracking-[-0.01em] text-ink">
          Гарантыч
        </p>
      </div>
    </section>
  );
}

/** Пусто в строке штампа. */
export function StampEmpty({ children = 'не указано' }: { children?: React.ReactNode }) {
  return <span className="font-normal text-ink-soft">{children}</span>;
}
