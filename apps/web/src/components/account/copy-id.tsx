'use client';

import { useEffect, useState } from 'react';

type CopyState = 'idle' | 'copied' | 'failed';

/** Номер аккаунта с кнопкой копирования: его называют поддержке. */
export function CopyId({ publicId }: { publicId: number }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 1800);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(publicId));
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Скопировать номер аккаунта"
      className="group -my-1 inline-flex min-h-8 items-center gap-2 rounded-[7px] border border-line bg-canvas px-2.5 text-sm text-ink-soft transition-colors duration-150 hover:border-ink/35 hover:text-ink active:scale-[0.97]"
    >
      <span>
        ID <span className="font-semibold tabular-nums text-ink">{publicId}</span>
      </span>
      <span aria-hidden="true" className="text-ink-soft group-hover:text-ink">
        {state === 'copied' ? (
          <svg
            viewBox="0 0 16 16"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 16 16"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.8" />
            <path d="M10.5 3.5v-.2A1.8 1.8 0 0 0 8.7 1.5H3.3A1.8 1.8 0 0 0 1.5 3.3v5.4a1.8 1.8 0 0 0 1.8 1.8h.2" />
          </svg>
        )}
      </span>
      <span
        role="status"
        aria-live="polite"
        className="text-xs font-medium text-accent empty:hidden"
      >
        {state === 'copied' ? 'Скопировано' : state === 'failed' ? 'Не удалось' : ''}
      </span>
    </button>
  );
}
