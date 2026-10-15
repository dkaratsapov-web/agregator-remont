import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { safeRedirectPath } from '@/lib/redirect';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Вход', robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  const target = safeRedirectPath(Array.isArray(next) ? next[0] : next);
  if (await getCurrentUser()) redirect(target);

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Вход</h1>
      <p className="mt-2 text-ink-soft">
        Нет аккаунта?{' '}
        <Link href="/register" className="font-semibold text-accent hover:underline">
          Зарегистрируйтесь
        </Link>
      </p>
      <div className="mt-8">
        <LoginForm next={target} />
      </div>
    </>
  );
}
