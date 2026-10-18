'use client';

import { JOB_SEARCH } from '@agregator/shared';
import { useEffect, useId, useRef, useState } from 'react';

/**
 * Поиск по каталогу заказов в шапке. Обычная GET-форма на /jobs?q=…: работает и без JavaScript.
 * На широком экране поле стоит в шапке, на узком — кнопка-лупа открывает поле под шапкой.
 * «/» с клавиатуры ставит курсор в поле (если фокус не в другом поле ввода); значка-подсказки
 * нет: без объяснения он непонятен.
 */
export function HeaderSearch({ app = false }: { app?: boolean }) {
  // app — шапка приложения (прямоугольные формы, как в кабинете); без него — вид главной.
  const radius = app ? 'rounded-[12px]' : 'rounded-full';
  const [open, setOpen] = useState(false);
  const inlineRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      // Поле в шапке видно только на широком экране; иначе открываем панель.
      if (inlineRef.current && inlineRef.current.offsetParent !== null) {
        inlineRef.current.focus();
      } else {
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      <form
        action="/jobs"
        method="get"
        role="search"
        aria-label="Поиск заказов"
        className="hidden min-w-0 flex-1 justify-center lg:flex"
      >
        <SearchField inputRef={inlineRef} app={app} />
      </form>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Закрыть поиск' : 'Поиск заказов'}
        className={`grid size-11 shrink-0 place-items-center ${radius} text-ink-soft transition-colors duration-150 hover:bg-ink/5 hover:text-ink lg:hidden`}
      >
        {open ? <CloseIcon /> : <SearchIcon />}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line/80 bg-canvas/95 px-4 py-3 supports-[backdrop-filter]:bg-canvas/85 supports-[backdrop-filter]:backdrop-blur-xl sm:px-6 lg:hidden"
      >
        <form action="/jobs" method="get" role="search" aria-label="Поиск заказов">
          <SearchField inputRef={panelRef} app={app} />
        </form>
      </div>
    </>
  );
}

function SearchField({
  inputRef,
  app,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  app: boolean;
}) {
  return (
    <label
      data-focus-ring="within"
      className={`group flex h-11 w-full max-w-md items-center gap-2.5 ${app ? 'rounded-[12px]' : 'rounded-full'} border border-line bg-surface/80 pl-4 pr-1.5 transition-[border-color,box-shadow] duration-150 focus-within:border-ink/30 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_14%,transparent)] hover:border-ink/20`}
    >
      <SearchIcon />
      <span className="sr-only">Найти заказ</span>
      <input
        ref={inputRef}
        type="search"
        name="q"
        placeholder="Найти заказ: плитка, электрика…"
        minLength={JOB_SEARCH.QUERY_MIN}
        maxLength={JOB_SEARCH.QUERY_MAX}
        required
        autoComplete="off"
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-[0.95rem] text-ink placeholder:text-ink-soft/70 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <button
        type="submit"
        className={`inline-flex h-8 shrink-0 items-center ${app ? 'rounded-[8px]' : 'rounded-full'} bg-ink px-3.5 text-sm font-semibold text-canvas transition-[background-color,transform] duration-150 hover:bg-ink/85 active:scale-[0.97]`}
      >
        Найти
      </button>
    </label>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-[18px] shrink-0 text-ink-soft"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="m13.5 13.5 4 4" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
    </svg>
  );
}
