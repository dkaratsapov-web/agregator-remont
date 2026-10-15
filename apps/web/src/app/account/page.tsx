import { USER_ROLE_LABELS } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutForm } from '@/components/auth/logout-form';
import { formatDate } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Личный кабинет', robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account');

  const isContractor = user.role === 'CONTRACTOR';

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 md:pt-14">
      <h1 className="break-words text-3xl font-semibold tracking-tight">
        Здравствуйте, {user.name}
      </h1>
      <p className="mt-2 text-ink-soft">Личный кабинет</p>

      <dl className="mt-8 grid gap-x-8 gap-y-5 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-ink-soft">Роль</dt>
          <dd className="mt-1 font-medium">{USER_ROLE_LABELS[user.role]}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Email</dt>
          <dd className="mt-1 break-all font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">На площадке с</dt>
          <dd className="mt-1 font-medium">
            <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="next-steps" className="mt-10">
        <h2 id="next-steps" className="text-lg font-semibold">
          {isContractor ? 'Поиск заказов' : 'Ваши заказы'}
        </h2>
        <p className="mt-2 max-w-prose text-ink-soft">
          {isContractor
            ? 'Отклики на заказы появятся в следующем обновлении. Пока можно изучить каталог.'
            : 'Публикуйте заказы и управляйте ими: редактируйте, пока заказ открыт, и закрывайте, когда исполнитель найден.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {isContractor ? (
            <Link
              href="/jobs"
              className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-5 font-medium hover:border-ink-soft/50"
            >
              Открыть каталог
            </Link>
          ) : (
            <>
              <Link
                href="/account/jobs/new"
                className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink transition-colors duration-150 hover:bg-accent-hover"
              >
                Новый заказ
              </Link>
              <Link
                href="/account/jobs"
                className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-5 font-medium hover:border-ink-soft/50"
              >
                Мои заказы
              </Link>
            </>
          )}
        </div>
      </section>

      <div className="mt-12 border-t border-line pt-6">
        <LogoutForm />
      </div>
    </div>
  );
}
