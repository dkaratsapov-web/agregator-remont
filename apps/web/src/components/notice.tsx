/** Сообщение после действия: «Заказ опубликован», «Изменения сохранены». */
export function Notice({
  children,
  tone = 'ok',
}: {
  children: React.ReactNode;
  /** ok — действие удалось; neutral — сведения без оценки. */
  tone?: 'ok' | 'neutral';
}) {
  return (
    <p
      role="status"
      className={`flex items-start gap-2.5 rounded-[10px] border px-4 py-3 text-sm font-medium ${
        tone === 'ok' ? 'border-ok/30 bg-ok-tint text-ok' : 'border-line bg-surface text-ink'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-[7px] size-1.5 shrink-0 rounded-[1px] ${tone === 'ok' ? 'bg-ok' : 'bg-accent'}`}
      />
      {children}
    </p>
  );
}
