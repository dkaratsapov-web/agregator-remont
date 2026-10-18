import Link from 'next/link';
import { getCurrentUser } from '@/lib/session';
import { AccountMenu } from './account-menu';
import { Wordmark } from './landing/wordmark';
import { NavLink } from './nav-link';

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/95 supports-[backdrop-filter]:bg-canvas/75 supports-[backdrop-filter]:backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="flex min-h-11 items-center rounded-lg"
          aria-label="Гарантыч, на главную"
        >
          <Wordmark />
        </Link>
        <nav aria-label="Основная навигация" className="flex items-center gap-1">
          <NavLink href="/jobs">Заказы</NavLink>
          <span className="hidden sm:contents">
            <NavLink href="/#how-it-works">Как это работает</NavLink>
          </span>
          {user ? (
            <AccountMenu
              user={{
                name: user.name,
                role: user.role,
                publicId: user.publicId,
                avatarVersion: user.avatarVersion,
              }}
            />
          ) : (
            <Link
              href="/login"
              className="ml-1 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas transition-[background-color,transform] duration-200 hover:bg-ink/85 active:scale-[0.97]"
            >
              Войти
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
