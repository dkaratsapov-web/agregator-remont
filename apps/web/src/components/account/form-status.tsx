/** Ответ формы настроек: ошибка (role=alert) или подтверждение (role=status). */
export function FormStatus({ error, done }: { error?: string; done?: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-accent/40 bg-accent-tint px-4 py-3 text-sm text-ink"
      >
        {error}
      </p>
    );
  }
  if (done) {
    return (
      <p role="status" className="rounded-xl bg-ok-tint px-4 py-3 text-sm font-medium text-ok">
        {done}
      </p>
    );
  }
  return null;
}
