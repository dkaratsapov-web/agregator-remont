/**
 * Ошибка формы. `login` — сессия закончилась: ссылка на вход в новой вкладке, чтобы не потерять
 * введённое в этой.
 */
export function FormError({ message, login }: { message?: string; login?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-accent/40 bg-accent-tint px-4 py-3 text-sm text-ink"
    >
      {message}
      {login ? (
        <>
          {' '}
          <a
            href={login}
            target="_blank"
            rel="noopener"
            className="font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
          >
            Войти в новой вкладке
          </a>
        </>
      ) : null}
    </p>
  );
}
