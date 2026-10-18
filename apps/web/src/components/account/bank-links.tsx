import { FormError } from '@/components/auth/form-error';
import type { BankId, BankProvider } from '@/lib/api';
import { BANK_TITLES } from '@/lib/bank-login';

/** Банки в настройках: привязанные отмечены, остальные можно привязать (переход в банк). */
export function BankLinks({
  banks,
  linked,
  error,
  justLinked,
}: {
  banks: BankProvider[];
  linked: string[];
  error?: string;
  justLinked?: BankId;
}) {
  return (
    <div className="space-y-4">
      <FormError message={error} />
      {justLinked ? (
        <p role="status" className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
          {BANK_TITLES[justLinked]} привязан. Теперь можно входить через него.
        </p>
      ) : null}
      <ul className="divide-y divide-line rounded-[12px] border border-line">
        {banks.map((bank) => (
          <li key={bank.id} className="flex min-h-14 items-center justify-between gap-4 px-4 py-2">
            <span className="font-medium">{bank.title}</span>
            {linked.includes(bank.id) ? (
              <span className="text-sm text-ink-soft">Привязан</span>
            ) : (
              <a
                href={`/auth/${bank.id}/start?mode=link`}
                className="inline-flex min-h-10 items-center rounded-[10px] border border-line bg-surface px-3.5 text-sm font-semibold hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Привязать
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
