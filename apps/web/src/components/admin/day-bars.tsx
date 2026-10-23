/** Число за день по дням периода: тонкие столбики одного цвета, подсказка на каждом (без JS). */
export function DayBars({
  label,
  days,
  values,
}: {
  label: string;
  days: string[];
  values: number[];
}) {
  const max = Math.max(1, ...values);
  const step = 6;
  const width = days.length * step;
  const height = 40;
  const summary = values.some((v) => v > 0)
    ? `${label} по дням: больше всего ${Math.max(...values)} за день`
    : `${label}: за период ни одного`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={summary}
      className="block h-10 w-full"
    >
      {values.map((value, i) => {
        const h = value === 0 ? 1 : Math.max(2, (value / max) * height);
        return (
          <rect
            key={days[i]}
            x={i * step}
            y={height - h}
            width={step - 2}
            height={h}
            rx={value === 0 ? 0 : 1}
            className={value === 0 ? 'fill-line' : 'fill-accent'}
          >
            <title>{`${formatDay(days[i])}: ${value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** YYYY-MM-DD (уже день по Москве) → «22 окт.». */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}
