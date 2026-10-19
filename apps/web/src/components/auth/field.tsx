interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  hint?: string;
  /** Сообщение об ошибке под полем (поле подсвечивается и получает aria-invalid). */
  error?: string;
}

export function Field({ label, name, hint, error, id, ...input }: FieldProps) {
  const inputId = id ?? `field-${name}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`mt-1.5 block min-h-12 w-full rounded-xl border bg-surface px-4 text-base text-ink placeholder:text-ink-soft focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 ${
          error ? 'border-accent' : 'border-line'
        }`}
        {...input}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm font-medium text-accent">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
