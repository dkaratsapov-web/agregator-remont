import Link from 'next/link';
import { getUnreadSummary } from '@/lib/notifications-server';
import { getCurrentUser } from '@/lib/session';
import { AccountMenu } from './account-menu';
import { HeaderSearch } from './header-search';
import { HowItWorksHint } from './how-it-works-hint';
import { Wordmark } from './landing/wordmark';
import { NavLink } from './nav-link';

export async function SiteHeader() {
  const [user, summary] = await Promise.all([getCurrentUser(), getUnreadSummary()]);
  return (
    <header className="sticky top-0 z-30 bg-canvas/95 supports-[backdrop-filter]:bg-canvas/80 supports-[backdrop-filter]:backdrop-blur-xl">
      {/* Нижняя кромка — шкала рулетки; терракотовая полоса на ней — сколько страницы прокручено. */}
      <div aria-hidden="true" className="header-ruler" />
      <div className="mx-auto flex h-[4.25rem] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center rounded-lg"
          aria-label="Гарантыч, на главную"
        >
          <Wordmark />
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 lg:gap-4">
          <HeaderSearch app />
          <nav aria-label="Основная навигация" className="flex shrink-0 items-center gap-2">
            {/* Разделы — как переключатель: активный залит, с терракотовой меткой. На самых узких
                экранах каталог открывается через поиск и меню кабинета. */}
            <div className="flex items-center gap-0.5 rounded-[12px] border border-line bg-surface/70 p-1 max-[400px]:hidden">
              <NavLink href="/jobs">Заказы</NavLink>
              <span className="hidden sm:contents">
                <HowItWorksHint buttonClassName="inline-flex min-h-9 items-center rounded-[9px] px-3.5 text-sm font-semibold text-ink-soft transition-colors duration-150 hover:bg-ink/5 hover:text-ink aria-expanded:bg-ink/5 aria-expanded:text-ink" />
              </span>
            </div>
            {user ? (
              <AccountMenu
                app
                unread={summary ? summary.unread + summary.reportDecisions : null}
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
                className="inline-flex min-h-11 items-center rounded-[12px] bg-ink px-5 text-sm font-semibold text-canvas transition-[background-color,transform] duration-200 hover:bg-ink/85 active:scale-[0.97]"
              >
                Войти
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
