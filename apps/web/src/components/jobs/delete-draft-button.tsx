'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Удаление в два нажатия: первое спрашивает подтверждение. Вопрос снимается, когда фокус уходит
 * с кнопки, а не по таймеру: человек с клавиатурой или скринридером успевает ответить, и вопрос
 * объявляется через aria-live (AUDIT_FINDINGS UX-11).
 */
export function DeleteDraftButton() {
  const { pending } = useFormStatus();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="submit"
        onClick={(event) => {
          // Первое нажатие только спрашивает. Отменяем отправку явно: если менять type кнопки,
          // React успевает перерисовать её в submit до действия по умолчанию, и форма уходит.
          if (confirming) return;
          event.preventDefault();
          setConfirming(true);
        }}
        onBlur={() => setConfirming(false)}
        disabled={pending}
        className={`inline-flex min-h-10 items-center rounded-[10px] border px-4 text-sm font-semibold transition-colors duration-150 disabled:opacity-60 ${
          confirming
            ? 'border-accent bg-accent text-accent-ink hover:bg-accent-hover'
            : 'border-line bg-surface text-ink-soft hover:border-ink/25 hover:text-ink'
        }`}
      >
        {pending ? 'Удаляем…' : confirming ? 'Точно удалить?' : 'Удалить'}
      </button>
      <span role="status" className="sr-only">
        {confirming ? 'Нажмите ещё раз, чтобы удалить черновик.' : ''}
      </span>
    </>
  );
}
