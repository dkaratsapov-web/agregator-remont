import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BankRoleForm } from '@/components/auth/bank-role-form';
import { RegisterForm } from '@/components/auth/register-form';
import { getBankProviders } from '@/lib/api';
import {
  BANK_TITLES,
  bankErrorMessage,
  describePending,
  isBankId,
  readBankPending,
} from '@/lib/bank-login';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Регистрация', robots: { index: false } };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, user, banks, pending] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getBankProviders(),
    readBankPending(),
  ]);
  if (user) redirect('/account');
  const one = (key: string) => (Array.isArray(query[key]) ? query[key][0] : query[key]);
  const bank = one('bank');
  const bankError = bankErrorMessage(one('bank_error'), isBankId(bank) ? bank : undefined);

  // Банк подтвердил человека, аккаунта ещё нет: осталось выбрать роль.
  const started = one('bank_step') === 'role' && pending ? describePending(pending) : null;
  if (started) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Почти готово</h1>
        <p className="mt-1.5 text-ink-soft">
          {started.name ? `${started.name}, вы` : 'Вы'} вошли через {BANK_TITLES[started.bank]}.
          Выберите, кто вы, и аккаунт будет создан.
        </p>
        <div className="mt-6 [@media(max-height:46rem)]:mt-4">
          <BankRoleForm />
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Регистрация</h1>
      <p className="mt-1.5 text-ink-soft">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Войдите
        </Link>
      </p>
      <div className="mt-6 [@media(max-height:46rem)]:mt-4">
        <RegisterForm banks={banks.map((b) => b.id)} error={bankError} />
      </div>
    </>
  );
}
