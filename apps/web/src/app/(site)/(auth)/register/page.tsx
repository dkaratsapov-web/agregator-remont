import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/register-form';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Регистрация', robots: { index: false } };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect('/account');

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Регистрация</h1>
      <p className="mt-1.5 text-ink-soft">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Войдите
        </Link>
      </p>
      <div className="mt-6">
        <RegisterForm />
      </div>
    </>
  );
}
