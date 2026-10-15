export function ApiUnavailable({ action }: { action?: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-2xl border border-line bg-surface p-8 text-center">
      <h2 className="text-lg font-semibold">Не удалось загрузить заказы</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
        Сервис временно недоступен. Обновите страницу через минуту.
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
