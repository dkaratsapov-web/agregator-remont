/** Пометка в списке заказов: по заказу есть непрочитанные уведомления. */
export function UnreadPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
      Новое<span className="sr-only">, непрочитанных уведомлений:</span>
      <span className="tabular-nums">{count > 99 ? '99+' : count}</span>
    </span>
  );
}
