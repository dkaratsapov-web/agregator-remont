'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

/** Удаление в два нажатия: первое спрашивает подтверждение, через 4 секунды вопрос снимается. */
export function DeleteDraftButton() {
  const { pending } = useFormStatus();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <button
      type="submit"
      onClick={(event) => {
        // Первое нажатие только спрашивает. Отменяем отправку явно: если менять type кнопки,
        // React успевает перерисовать её в submit до действия по умолчанию, и форма уходит.
        if (confirming) return;
        event.preventDefault();
        setConfirming(true);
      }}
      disabled={pending}
      className={`inline-flex min-h-10 items-center rounded-[10px] border px-4 text-sm font-semibold transition-colors duration-150 disabled:opacity-60 ${
        confirming
          ? 'border-accent bg-accent text-accent-ink hover:bg-accent-hover'
          : 'border-line bg-surface text-ink-soft hover:border-ink/25 hover:text-ink'
      }`}
    >
      {pending ? 'Удаляем…' : confirming ? 'Точно удалить?' : 'Удалить'}
    </button>
  );
}
