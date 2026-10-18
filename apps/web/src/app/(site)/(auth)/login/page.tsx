import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getBankProviders } from '@/lib/api';
import { bankErrorMessage, isBankId } from '@/lib/bank-login';
import { safeRedirectPath } from '@/lib/redirect';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Вход', robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, user, banks] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getBankProviders(),
  ]);
  const one = (key: string) => (Array.isArray(query[key]) ? query[key][0] : query[key]);
  const target = safeRedirectPath(one('next'));
  if (user) redirect(target);
  const bank = one('bank');
  const bankError = bankErrorMessage(one('bank_error'), isBankId(bank) ? bank : undefined);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Вход</h1>
      <p className="mt-1.5 text-ink-soft">
        Нет аккаунта?{' '}
        <Link href="/register" className="font-semibold text-accent hover:underline">
          Зарегистрируйтесь
        </Link>
      </p>
      <div className="mt-6 [@media(max-height:46rem)]:mt-4">
        <LoginForm next={target} banks={banks.map((b) => b.id)} error={bankError} />
      </div>
    </>
  );
}
