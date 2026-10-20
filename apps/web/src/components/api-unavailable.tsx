export function ApiUnavailable({
  action,
  title = 'Не удалось загрузить заказы',
}: {
  action?: React.ReactNode;
  title?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-[14px] border border-line bg-surface px-6 py-10 text-center"
    >
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
        Сервис временно недоступен. Обновите страницу через минуту.
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
