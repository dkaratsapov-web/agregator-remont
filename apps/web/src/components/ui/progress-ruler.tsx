/**
 * Заполненность как шкала рулетки: деление на каждый пункт, заполненные — цветом акцента,
 * каждое пятое деление длиннее. Анкета заказа, штамп заказа, профиль.
 */
export function ProgressRuler({
  answered,
  total,
  className = '',
  label = 'Заполнение анкеты',
}: {
  answered: number;
  total: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={answered}
      className={`relative flex h-3 items-end justify-between ${className}`}
    >
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-ink/15" />
      {Array.from({ length: Math.max(total, 1) + 1 }, (_, i) => (
        <span
          key={i}
          className={`relative w-[2px] transition-colors duration-300 motion-reduce:transition-none ${
            i % 5 === 0 ? 'h-3' : 'h-2'
          } ${i > 0 && i <= answered ? 'bg-accent' : 'bg-ink/25'}`}
        />
      ))}
    </div>
  );
}
