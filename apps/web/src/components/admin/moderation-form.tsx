'use client';

import { useActionState, useId } from 'react';
import type { ModerationFormState } from '@/app/(site)/admin/reports/actions';

export interface ModerationButton {
  label: string;
  /** Значение поля decision (для решения по жалобе). */
  value?: string;
  tone?: 'danger' | 'plain';
}

/**
 * Действие модератора: раскрывается по нажатию, требует пояснение (оно попадает в журнал),
 * отправляется Server Action — работает и без JS.
 */
export function ModerationForm({
  action,
  summary,
  label,
  buttons,
  tone = 'plain',
}: {
  action: (prev: ModerationFormState, form: FormData) => Promise<ModerationFormState>;
  summary: string;
  label: string;
  buttons: ModerationButton[];
  tone?: 'danger' | 'plain';
}) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {});
  return (
    // Раскрытая форма занимает всю строку: соседние действия не сдвигаются вбок.
    <details className="group open:basis-full">
      <summary
        className={`inline-flex min-h-10 cursor-pointer list-none items-center rounded-[10px] border px-3.5 text-sm font-semibold transition-colors [&::-webkit-details-marker]:hidden ${
          tone === 'danger'
            ? 'border-accent/40 text-accent-hover hover:border-accent'
            : 'border-line text-ink hover:border-ink/30'
        }`}
      >
        {summary}
      </summary>
      <form
        action={formAction}
        className="mt-2 space-y-2.5 rounded-[12px] border border-line bg-canvas p-3.5"
      >
        <label htmlFor={`${id}-text`} className="block text-sm font-medium text-ink">
          {label}
        </label>
        <textarea
          id={`${id}-text`}
          name="text"
          rows={2}
          required
          minLength={5}
          maxLength={500}
          className="block w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-base text-ink"
        />
        {state.error ? (
          <p role="alert" className="text-sm text-accent">
            {state.error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {buttons.map((button) => (
            <button
              key={button.label}
              type="submit"
              name={button.value ? 'decision' : undefined}
              value={button.value}
              disabled={pending}
              className={`inline-flex min-h-10 items-center rounded-[10px] px-4 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-70 ${
                button.tone === 'danger'
                  ? 'bg-accent text-accent-ink hover:bg-accent-hover'
                  : 'bg-ink text-canvas hover:bg-ink/85'
              }`}
            >
              {pending ? 'Сохраняем…' : button.label}
            </button>
          ))}
        </div>
      </form>
    </details>
  );
}
