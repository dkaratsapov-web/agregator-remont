import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { readResetToken } from '@/lib/password-reset';

// Без referrer: no-referrer — с ним браузер шлёт форму с Origin: null, и Next.js её отвергает.
// Токена в адресе этой страницы нет: его забирает /reset/<токен> (там Referrer-Policy строже).
export const metadata: Metadata = { title: 'Новый пароль', robots: { index: false } };

export default async function ResetPasswordPage() {
  const token = await readResetToken();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Новый пароль</h1>
      {token ? (
        <>
          <p className="mt-1.5 text-ink-soft">
            Придумайте новый пароль. После сохранения все прежние входы завершатся, а вы сразу
            войдёте с новым паролем.
          </p>
          <div className="mt-6">
            <ResetPasswordForm />
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-3 text-ink-soft">
          <p>
            Ссылка не найдена или устарела. Откройте ссылку из сообщения администратора ещё раз или
            попросите новую: напишите в поддержку и назовите email аккаунта.
          </p>
          <p>
            <Link href="/login" className="font-semibold text-accent hover:underline">
              Вернуться ко входу
            </Link>
          </p>
        </div>
      )}
    </>
  );
}
