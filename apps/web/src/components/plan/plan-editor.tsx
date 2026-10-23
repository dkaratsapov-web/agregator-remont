'use client';

import { PLAN_LIMITS, type JobStageDto } from '@agregator/shared';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { FormError } from '@/components/auth/form-error';
import type { PlanActionState } from '@/app/(site)/account/plan/actions';
import { STAGE_ROWS, stageField, type StageRowValues } from '@/lib/plan-form';
import { FormArgs } from '@/components/ui/form-args';
import type { FormArg } from '@/lib/form-args';

const FIELD =
  'mt-1 block w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0';

const emptyRow: StageRowValues = { title: '', description: '', durationDays: '' };
const filled = (row: StageRowValues) => Boolean(row.title || row.description || row.durationDays);

/**
 * Черновик плана: до 10 этапов, порядок сдачи, «Сохранить» и «Отправить на согласование».
 * Без JS видны все строки; с JS — заполненные и одна пустая, «Добавить этап» открывает следующую.
 */
export function PlanEditor({
  args,
  action,
  stages,
  sequential,
}: {
  action: (state: PlanActionState, form: FormData) => Promise<PlanActionState>;
  /** Параметры действия скрытым полем вместо bind (lib/form-args.ts). */
  args?: readonly FormArg[];
  stages: JobStageDto[];
  sequential: boolean;
}) {
  const [state, formAction, pending] = useActionState<PlanActionState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const initial: StageRowValues[] = Array.from({ length: STAGE_ROWS }, (_, row) => {
    const stage = stages[row];
    return stage
      ? {
          title: stage.title,
          description: stage.description,
          durationDays: stage.durationDays === null ? '' : String(stage.durationDays),
        }
      : emptyRow;
  });
  const rows = state.values?.stages ?? initial;
  const lastFilled = rows.reduce((last, row, index) => (filled(row) ? index : last), -1);
  // До гидратации (и без JS) видны все строки.
  const [visible, setVisible] = useState<number>(STAGE_ROWS);
  useEffect(() => setVisible(Math.min(STAGE_ROWS, Math.max(1, lastFilled + 2))), [lastFilled]);

  const fields = useMemo(() => state.fields ?? {}, [state.fields]);
  useEffect(() => {
    const first = Object.keys(fields).find((key) => key !== 'stages');
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }, [fields]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      {args ? <FormArgs values={args} /> : null}
      <FormError message={state.error} login={state.login} />
      <ol className="space-y-4">
        {rows.map((row, index) => {
          const err = (name: keyof StageRowValues) => fields[stageField(index, name)];
          const id = (name: keyof StageRowValues) => `plan-${stageField(index, name)}`;
          return (
            <li
              key={index}
              hidden={index >= visible}
              className="rounded-[12px] border border-line bg-canvas p-4"
            >
              <p className="font-display text-sm font-semibold text-ink">Этап {index + 1}</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <div>
                  <label htmlFor={id('title')} className="block text-sm font-medium text-ink">
                    Название
                  </label>
                  <input
                    id={id('title')}
                    name={stageField(index, 'title')}
                    defaultValue={row.title}
                    maxLength={PLAN_LIMITS.TITLE_MAX}
                    aria-invalid={err('title') ? true : undefined}
                    aria-describedby={err('title') ? `${id('title')}-error` : undefined}
                    className={`${FIELD} ${err('title') ? 'border-accent' : 'border-line'}`}
                  />
                  {err('title') ? (
                    <p id={`${id('title')}-error`} className="mt-1 text-sm font-medium text-accent">
                      {err('title')}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label
                    htmlFor={id('durationDays')}
                    className="block text-sm font-medium text-ink"
                  >
                    Срок, дней
                  </label>
                  <input
                    id={id('durationDays')}
                    name={stageField(index, 'durationDays')}
                    defaultValue={row.durationDays}
                    inputMode="numeric"
                    aria-invalid={err('durationDays') ? true : undefined}
                    aria-describedby={
                      err('durationDays') ? `${id('durationDays')}-error` : undefined
                    }
                    className={`${FIELD} tabular-nums ${err('durationDays') ? 'border-accent' : 'border-line'}`}
                  />
                  {err('durationDays') ? (
                    <p
                      id={`${id('durationDays')}-error`}
                      className="mt-1 text-sm font-medium text-accent"
                    >
                      {err('durationDays')}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-3">
                <label htmlFor={id('description')} className="block text-sm font-medium text-ink">
                  Что входит <span className="font-normal text-ink-soft">(необязательно)</span>
                </label>
                <textarea
                  id={id('description')}
                  name={stageField(index, 'description')}
                  defaultValue={row.description}
                  rows={2}
                  maxLength={PLAN_LIMITS.DESCRIPTION_MAX}
                  aria-invalid={err('description') ? true : undefined}
                  className={`${FIELD} leading-relaxed ${err('description') ? 'border-accent' : 'border-line'}`}
                />
              </div>
            </li>
          );
        })}
      </ol>
      {visible < STAGE_ROWS ? (
        <button
          type="button"
          onClick={() => setVisible((count) => Math.min(STAGE_ROWS, count + 1))}
          className="inline-flex min-h-11 items-center rounded-[10px] border border-dashed border-ink/30 px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink/60"
        >
          Добавить этап
        </button>
      ) : null}
      {fields.stages ? <p className="text-sm font-medium text-accent">{fields.stages}</p> : null}

      <label className="flex min-h-11 items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          name="sequential"
          defaultChecked={state.values ? state.values.sequential : sequential}
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span>
          <span className="font-medium">Этапы сдаются строго по порядку</span>
          <span className="block text-ink-soft">
            Следующий этап можно сдать только после приёмки предыдущего. Без отметки — в любом
            порядке.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="propose"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? 'Сохраняем…' : 'Отправить на согласование'}
        </button>
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-5 font-semibold text-ink transition-colors duration-150 hover:border-ink/30 disabled:cursor-wait disabled:opacity-70"
        >
          Сохранить черновик
        </button>
      </div>
    </form>
  );
}
