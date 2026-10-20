'use client';

import { LEAD_LIMITS } from '@agregator/shared';
import { useState } from 'react';

const inputClass =
  'mt-1.5 block min-h-13 w-full rounded-2xl border border-line bg-canvas px-4 text-base text-ink placeholder:text-ink-soft transition-colors duration-150 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60';

function Submit({ disabled, pending }: { disabled: boolean; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="group inline-flex min-h-13 w-full items-center justify-center gap-3 rounded-full bg-ink py-1.5 pl-6 pr-1.5 text-base font-semibold text-canvas transition-[background-color,transform] duration-200 hover:bg-[#1c2536] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? 'Отправляем…' : 'Оставить заявку'}
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full bg-accent text-accent-ink transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-enabled:group-hover:translate-x-0.5 group-enabled:group-hover:-translate-y-0.5"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

/**
 * Заявка на закрытое тестирование: имя, телефон, согласие. Пока не заполнены реквизиты
 * оператора персональных данных (`open` = false), форма видна, но выключена.
 */
export function LeadForm({ open }: { open: boolean }) {
  const [state, setState] = useState<{ sent?: boolean; error?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const res = await fetch('/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          phone: form.get('phone'),
          consent: form.get('consent') === 'on',
          website: form.get('website') || undefined,
        }),
      });
      if (res.ok) {
        setState({ sent: true });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      setState({
        error:
          typeof body.error === 'string'
            ? body.error
            : 'Не удалось отправить заявку. Попробуйте позже.',
      });
    } catch {
      setState({ error: 'Нет связи с сервером. Проверьте интернет и попробуйте снова.' });
    } finally {
      setPending(false);
    }
  }

  if (state.sent) {
    return (
      <div role="status" className="rounded-3xl bg-ok-tint p-6 sm:p-8">
        <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
          Заявка отправлена
        </p>
        <p className="mt-2 text-ink-soft">
          Позвоним или напишем, когда откроем доступ для новых участников.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!open ? (
        <p className="rounded-2xl bg-accent-tint px-4 py-3 text-sm font-medium text-ink">
          Приём заявок откроется в ближайшие дни.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-2xl bg-accent-tint px-4 py-3 text-sm text-ink">
          {state.error}
        </p>
      ) : null}
      <fieldset disabled={!open} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lead-name" className="text-sm font-medium text-ink">
              Имя
            </label>
            <input
              id="lead-name"
              name="name"
              autoComplete="given-name"
              required
              minLength={LEAD_LIMITS.NAME_MIN}
              maxLength={LEAD_LIMITS.NAME_MAX}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="lead-phone" className="text-sm font-medium text-ink">
              Телефон
            </label>
            <input
              id="lead-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+7 900 123-45-67"
              required
              maxLength={LEAD_LIMITS.PHONE_RAW_MAX}
              className={inputClass}
            />
          </div>
        </div>
        {/* Ловушка для ботов: скрыта от людей и программ чтения экрана. */}
        <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
          <label htmlFor="lead-website">Сайт</label>
          <input id="lead-website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <label className="flex cursor-pointer gap-3 text-sm leading-relaxed text-ink-soft has-[:disabled]:cursor-not-allowed">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          />
          <span>
            Даю согласие на обработку имени и телефона для связи по закрытому тестированию по{' '}
            <a
              href="/privacy"
              className="font-medium text-ink underline decoration-accent/60 underline-offset-4 hover:decoration-accent"
            >
              политике конфиденциальности
            </a>
            .
          </span>
        </label>
        <Submit disabled={!open} pending={pending} />
      </fieldset>
    </form>
  );
}
