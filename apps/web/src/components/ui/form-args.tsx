import { ARGS_FIELD, encodeFormArgs, type FormArg } from '@/lib/form-args';

/** Параметры действия скрытым полем вместо `action.bind(...)` (lib/form-args.ts). */
export function FormArgs({ values }: { values: readonly FormArg[] }) {
  return <input type="hidden" name={ARGS_FIELD} value={encodeFormArgs(values)} />;
}
