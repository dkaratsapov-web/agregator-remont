'use client';

import { useActionState } from 'react';
import type { ModerationFormState } from '@/app/(site)/admin/reports/actions';
import { FormArgs } from '@/components/ui/form-args';
import type { FormArg } from '@/lib/form-args';

/** Разобрать пометку автопроверки одной кнопкой (без пояснения); работает и без JS. */
export function FlagResolveForm({
  args,
  action,
}: {
  action: (prev: ModerationFormState, form: FormData) => Promise<ModerationFormState>;
  /** Параметры действия скрытым полем вместо bind (lib/form-args.ts). */
  args?: readonly FormArg[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {args ? <FormArgs values={args} /> : null}
      {[
        { value: 'DISMISSED', label: 'Нарушения нет' },
        { value: 'RESOLVED', label: 'Меры приняты' },
      ].map((button) => (
        <button
          key={button.value}
          type="submit"
          name="decision"
          value={button.value}
          disabled={pending}
          className="inline-flex min-h-10 items-center rounded-[10px] border border-line px-3.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30 disabled:cursor-wait disabled:opacity-70"
        >
          {button.label}
        </button>
      ))}
      {state.error ? (
        <p role="alert" className="basis-full text-sm text-accent">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
