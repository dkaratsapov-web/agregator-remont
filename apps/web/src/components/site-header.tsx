import Link from 'next/link';
import { getCurrentUser } from '@/lib/session';
import { NavLink } from './nav-link';

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 supports-[backdrop-filter]:bg-surface/85 supports-[backdrop-filter]:backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5 font-semibold tracking-tight text-ink"
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-ink"
          >
            АР
          </span>
          <span className="hidden sm:inline">Агрегатор Ремонт</span>
        </Link>
        <nav aria-label="Основная навигация" className="flex items-center gap-1">
          <NavLink href="/jobs">Заказы</NavLink>
          <span className="hidden sm:contents">
            <NavLink href="/#how-it-works">Как это работает</NavLink>
          </span>
          {user ? (
            <NavLink href="/account">Кабинет</NavLink>
          ) : (
            <Link
              href="/login"
              className="ml-1 inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-canvas transition-opacity duration-150 hover:opacity-90"
            >
              Войти
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
