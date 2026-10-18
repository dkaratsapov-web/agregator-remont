import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Field } from '@/components/auth/field';
import { FormError } from '@/components/auth/form-error';
import { Wordmark } from '@/components/landing/wordmark';
import { gateConfig, gateCookieName, isValidGatePass } from '@/lib/gate';
import { safeRedirectPath } from '@/lib/redirect';

export const metadata: Metadata = { title: 'Вход для тестировщиков', robots: { index: false } };

const ERRORS: Record<string, string> = {
  wrong: 'Неверный логин или пароль.',
  locked: 'Слишком много попыток. Подождите 15 минут и попробуйте снова.',
  unavailable: 'Вход сейчас недоступен. Напишите администратору сайта.',
  origin: 'Запрос отклонён. Обновите страницу и попробуйте снова.',
  invalid: 'Запрос отклонён. Обновите страницу и попробуйте снова.',
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Вход для тестировщиков на время закрытого теста (lib/gate.ts). Вне группы (site): страница
 * открыта без пароля (deploy/Caddyfile), поэтому без шапки с поиском и ссылками в кабинет.
 */
export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(first(params.next) ?? '/');
  const pass = (await cookies()).get(gateCookieName())?.value;
  if (isValidGatePass(gateConfig(), pass)) redirect(next);
  const error = ERRORS[first(params.error) ?? ''];

  return (
    <main
      id="main"
      className="mx-auto grid min-h-dvh max-w-[1600px] gap-10 px-4 pb-12 pt-6 sm:px-6 lg:grid-cols-2 lg:items-stretch lg:gap-12 lg:px-10 lg:py-10"
    >
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden rounded-[28px] bg-[#0d1320] p-10 text-[#eef1f6] shadow-[0_30px_60px_-30px_rgb(13_19_32/0.55)] lg:flex lg:flex-col lg:justify-between"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_70%_30%,rgb(194_65_12/0.28),transparent_70%),linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[length:auto,32px_32px,32px_32px]" />
        <p className="relative text-sm font-semibold text-white/50">Закрытое тестирование</p>
        <div className="relative">
          <p className="font-display text-4xl font-semibold leading-[1.08] tracking-[-0.035em]">
            Честный ремонт без лишнего риска
          </p>
          <p className="mt-6 max-w-md text-white/70">
            Сервис готовится к запуску. Пока каталог, кабинет и вход открыты только тестировщикам.
          </p>
        </div>
      </aside>

      <div className="flex flex-col">
        <Link href="/" className="self-start rounded-lg" aria-label="Гарантыч, на главную">
          <Wordmark />
        </Link>
        <div className="mx-auto mt-10 w-full max-w-md lg:my-auto lg:py-8">
          <div className="rounded-[28px] border border-line/70 bg-surface p-6 shadow-[0_1px_1px_hsl(var(--shadow-color)/0.05),0_8px_24px_-8px_hsl(var(--shadow-color)/0.16)] sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight">Вход для тестировщиков</h1>
            <p className="mt-2 text-ink-soft">
              Введите логин и пароль, которые вам выдали для закрытого теста.
            </p>
            <form method="post" action="/gate/login" className="mt-8 space-y-5">
              <FormError message={error} />
              <input type="hidden" name="next" value={next} />
              <Field
                label="Логин"
                name="login"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
              />
              <Field
                label="Пароль"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              <button
                type="submit"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-6 text-base font-semibold text-accent-ink transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.97]"
              >
                Войти
              </button>
            </form>
          </div>
          <p className="mt-6 text-center text-sm text-ink-soft">
            Нет доступа?{' '}
            <Link href="/" className="font-semibold text-accent hover:underline">
              Вернуться на главную
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
