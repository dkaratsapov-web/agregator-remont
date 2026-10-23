'use client';

import { useEffect, useId, useRef } from 'react';

const STEPS = [
  {
    title: 'Опишите задачу',
    text: 'Что сделать, город и бюджет. Заказ появится в каталоге.',
  },
  {
    title: 'Получите отклики',
    text: 'Мастера предлагают свою цену и срок.',
  },
  {
    title: 'Выберите исполнителя',
    text: 'Сравните цены, сроки, отзывы и рейтинг.',
  },
  {
    title: 'Принимайте работу по этапам',
    text: 'План, фото-отчёты и переписка в заказе. Оплата через сервис — скоро.',
  },
];

/** Отступ подсказки от краёв окна, px. */
const EDGE = 12;

/**
 * «Как это работает» в шапке: небольшая подсказка вместо перехода на главную. Встроенный
 * popover браузера: открывается и без JS, закрывается щелчком мимо и Esc. С JS подсказка
 * встаёт под кнопкой; без JS — в правом верхнем углу под шапкой.
 */
export function HowItWorksHint({ buttonClassName }: { buttonClassName: string }) {
  const id = `how-it-works-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const place = (event: Event) => {
      if ((event as ToggleEvent).newState !== 'open' || !button.current) return;
      const rect = button.current.getBoundingClientRect();
      const width = Math.min(352, window.innerWidth - EDGE * 2);
      const left = Math.min(
        Math.max(EDGE, rect.left + rect.width / 2 - width / 2),
        window.innerWidth - width - EDGE,
      );
      Object.assign(el.style, { top: `${rect.bottom + 8}px`, left: `${left}px`, right: 'auto' });
    };
    // Окно изменилось — подсказка под кнопкой уже не там: закрываем.
    const close = () => el.matches(':popover-open') && el.hidePopover();
    el.addEventListener('beforetoggle', place);
    window.addEventListener('resize', close);
    return () => {
      el.removeEventListener('beforetoggle', place);
      window.removeEventListener('resize', close);
    };
  }, []);

  return (
    <>
      <button ref={button} type="button" popoverTarget={id} className={buttonClassName}>
        Как это работает
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        className="fixed inset-auto right-4 top-[4.75rem] m-0 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-surface p-4 text-left text-ink shadow-[0_12px_32px_-12px_rgb(13_19_32/0.25)]"
      >
        <div className="flex items-start justify-between gap-3">
          <p id={`${id}-title`} className="text-sm font-semibold">
            Как это работает
          </p>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="Закрыть"
            className="-mr-1.5 -mt-1.5 inline-flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-ink/5 hover:text-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
        <ol className="mt-2 space-y-2.5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-ink text-[11px] font-semibold text-canvas tabular-nums"
              >
                {i + 1}
              </span>
              <span className="text-sm leading-snug">
                <span className="font-semibold">{step.title}.</span>{' '}
                <span className="text-ink-soft">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
