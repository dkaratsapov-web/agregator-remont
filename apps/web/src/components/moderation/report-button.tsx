'use client';

import {
  REPORT_LIMITS,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportTarget,
} from '@agregator/shared';
import { useActionState, useEffect, useId, useState } from 'react';
import { reportFormAction, type ReportFormState } from '@/app/(site)/account/reports/actions';
import { FormArgs } from '@/components/ui/form-args';

const NOUN: Record<ReportTarget, string> = {
  JOB: 'заказ',
  MESSAGE: 'сообщение',
  BID: 'отклик',
};

/**
 * «Пожаловаться»: раскрывается по нажатию (details), причина и пояснение, отправка — Server
 * Action, работает и без JS. Администратор увидит жалобу в очереди; автор о ней не узнает.
 */
export function ReportButton({
  targetType,
  targetId,
  returnTo,
  align = 'start',
}: {
  targetType: ReportTarget;
  targetId: string;
  returnTo: string;
  align?: 'start' | 'end';
}) {
  const id = useId();
  // С JS итог показывается в самой форме; без JS действие переходит на страницу с ?report=…
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [state, action, pending] = useActionState<ReportFormState, FormData>(reportFormAction, {});
  if (state.sent) {
    return (
      <p role="status" className="text-xs text-ink-soft">
        {state.sent.duplicate
          ? 'Вы уже пожаловались: жалоба ждёт разбора.'
          : 'Жалоба отправлена. Администратор разберёт её.'}
      </p>
    );
  }
  return (
    <details className={`group text-sm ${align === 'end' ? 'text-right' : ''}`}>
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center rounded-[8px] px-1 text-xs font-medium text-ink-soft underline decoration-ink/20 underline-offset-4 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        Пожаловаться
      </summary>
      <form
        action={action}
        className="mt-2 space-y-3 rounded-[12px] border border-line bg-surface p-4 text-left"
      >
        <FormArgs values={[targetType, targetId, returnTo]} />
        {hydrated ? <input type="hidden" name="js" value="1" /> : null}
        <fieldset>
          <legend className="text-sm font-semibold text-ink">
            Почему вы жалуетесь на {NOUN[targetType]}?
          </legend>
          <div className="mt-2 space-y-1.5">
            {REPORT_REASONS.map((reason, i) => (
              <label
                key={reason}
                className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm"
              >
                <input
                  type="radio"
                  name="reason"
                  value={reason}
                  required
                  defaultChecked={i === 0}
                  className="size-4 accent-[var(--accent)]"
                />
                {REPORT_REASON_LABELS[reason]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${id}-comment`} className="block text-sm font-medium text-ink">
            Пояснение{' '}
            <span className="font-normal text-ink-soft">(для «Другое» — обязательно)</span>
          </label>
          <textarea
            id={`${id}-comment`}
            name="comment"
            rows={3}
            maxLength={REPORT_LIMITS.COMMENT_MAX}
            className="mt-1.5 block w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-base text-ink"
          />
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-accent">
            {state.error}
            {state.login ? (
              <>
                {' '}
                <a href={state.login} target="_blank" rel="noopener" className="underline">
                  Войти
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-canvas transition-colors hover:bg-ink/85 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? 'Отправляем…' : 'Отправить жалобу'}
        </button>
      </form>
    </details>
  );
}
