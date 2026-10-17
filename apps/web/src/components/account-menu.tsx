'use client';

import { USER_ROLE_LABELS, type UserRole } from '@agregator/shared';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { logoutAction, type AuthFormState } from '@/app/(site)/(auth)/actions';

export interface MenuUser {
  name: string;
  role: UserRole;
}

type MenuLink = { href: string; label: string; soon?: boolean };

/** Ссылки зависят от роли; права на сами страницы проверяет API. */
const ROLE_LINKS: Record<UserRole, MenuLink[]> = {
  CUSTOMER: [
    { href: '/account/jobs', label: 'Мои заказы' },
    { href: '/account/jobs/new', label: 'Новый заказ' },
    { href: '/jobs', label: 'Каталог заказов' },
  ],
  CONTRACTOR: [
    { href: '/account/bids', label: 'Мои отклики' },
    { href: '/account/profile', label: 'Профиль мастера' },
    { href: '/jobs?open=1', label: 'Найти заказ' },
  ],
  ADMIN: [
    { href: '/admin/leads', label: 'Заявки на тестирование' },
    { href: '/jobs', label: 'Каталог заказов' },
  ],
};

/** Разделы в разработке: страницы есть и честно говорят, что раздел скоро появится. */
const SECTION_LINKS: MenuLink[] = [
  { href: '/account/favorites', label: 'Избранное', soon: true },
  { href: '/account/chats', label: 'Чаты', soon: true },
  { href: '/account/cart', label: 'Корзина', soon: true },
];

const ICONS = {
  favorites: <path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z" />,
  chats: <path d="M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5L5 18.5Z" />,
  cart: (
    <>
      <path d="M3.5 4.5h2l2 10.5h10l1.8-7.5H7" />
      <circle cx="9" cy="19" r="1.2" />
      <circle cx="16.5" cy="19" r="1.2" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

const QUICK = [
  { href: '/account/favorites', label: 'Избранное', icon: 'favorites' },
  { href: '/account/chats', label: 'Чаты', icon: 'chats' },
  { href: '/account/cart', label: 'Корзина', icon: 'cart' },
] as const;

const itemClass =
  'flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 text-[15px] text-ink transition-colors duration-150 hover:bg-muted-tint focus-visible:bg-muted-tint';

function LogoutItem() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(logoutAction, {});
  return (
    <form action={action}>
      {state.error ? (
        <p role="alert" className="px-3 pb-2 text-sm text-accent">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={`${itemClass} w-full text-ink-soft disabled:cursor-wait disabled:opacity-70`}
      >
        {pending ? 'Выходим…' : 'Выйти'}
      </button>
    </form>
  );
}

/**
 * Иконки разделов и меню кабинета. Меню открывается наведением мыши, нажатием (телефон)
 * и с клавиатуры; закрывается уходом курсора, Escape и нажатием вне меню.
 */
export function AccountMenu({ user }: { user: MenuUser }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const panelId = useId();
  const initial = user.name.trim().charAt(0).toUpperCase() || '?';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const hoverOpen = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  return (
    <div className="flex items-center gap-1">
      <div className="hidden items-center sm:flex">
        {QUICK.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            className="grid size-11 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
          >
            <Icon name={item.icon} />
          </a>
        ))}
      </div>

      <div
        ref={rootRef}
        className="relative"
        onPointerEnter={hoverOpen}
        onPointerLeave={hoverClose}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Меню кабинета: ${user.name}`}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 max-w-[55vw] items-center gap-2.5 rounded-full border border-line bg-surface/80 py-1 pl-1 pr-3.5 text-sm font-semibold text-ink transition-[background-color,border-color] duration-200 hover:border-ink/25 hover:bg-surface aria-expanded:border-ink/25 aria-expanded:bg-surface sm:max-w-xs"
        >
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-canvas"
          >
            {initial}
          </span>
          <span className="min-w-0 truncate">{user.name}</span>
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`size-3.5 shrink-0 text-ink-soft transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>

        {/* pt-2 — «мостик» между кнопкой и панелью, чтобы меню не закрывалось при переходе курсора. */}
        <div
          id={panelId}
          data-open={open}
          className="invisible absolute right-0 top-full z-50 pt-2 opacity-0 transition-[opacity,transform,visibility] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-[open=false]:-translate-y-1 data-[open=true]:visible data-[open=true]:opacity-100 motion-reduce:transition-none"
        >
          <nav
            aria-label="Меню кабинета"
            className="w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-2 shadow-[0_24px_48px_-16px_rgb(13_19_32/0.22),0_2px_6px_rgb(13_19_32/0.06)]"
          >
            <a
              href="/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl p-2.5 transition-colors duration-150 hover:bg-muted-tint"
            >
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-base font-semibold text-canvas"
              >
                {initial}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{user.name}</span>
                <span className="block text-sm text-ink-soft">
                  {USER_ROLE_LABELS[user.role]} · Личный кабинет
                </span>
              </span>
            </a>

            {[ROLE_LINKS[user.role], SECTION_LINKS].map((group, i) => (
              <ul key={i} className="mt-2 border-t border-line pt-2">
                {group.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} onClick={() => setOpen(false)} className={itemClass}>
                      {link.label}
                      {link.soon ? (
                        <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                          Скоро
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            ))}

            <div className="mt-2 border-t border-line pt-2">
              <LogoutItem />
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
