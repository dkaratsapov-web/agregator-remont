export default function JobsLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-10 sm:px-6 md:pt-14 lg:px-10" aria-busy="true">
      <span className="sr-only">Загружаем заказы</span>
      <div className="h-10 w-64 animate-pulse rounded-lg bg-muted-tint motion-reduce:animate-none" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
        <div
          className="h-72 animate-pulse rounded-[24px] bg-muted-tint motion-reduce:animate-none"
          aria-hidden="true"
        />
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li
              key={i}
              className="h-52 animate-pulse rounded-2xl bg-muted-tint motion-reduce:animate-none"
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
