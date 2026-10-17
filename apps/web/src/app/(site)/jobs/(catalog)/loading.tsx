export default function JobsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-14" aria-busy="true">
      <span className="sr-only">Загружаем заказы</span>
      <div className="h-10 w-64 animate-pulse rounded-lg bg-muted-tint motion-reduce:animate-none" />
      <div className="mt-6 flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-10 w-28 animate-pulse rounded-full bg-muted-tint motion-reduce:animate-none"
          />
        ))}
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li
            key={i}
            className="h-52 animate-pulse rounded-2xl bg-muted-tint motion-reduce:animate-none"
          />
        ))}
      </ul>
    </div>
  );
}
