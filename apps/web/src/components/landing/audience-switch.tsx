'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useId, useRef, useState } from 'react';
import { StatusPill, type FeatureStatus } from './status-pill';

type Item = { title: string; text: string; status: FeatureStatus };

const AUDIENCES: { key: string; label: string; items: Item[] }[] = [
  {
    key: 'customers',
    label: 'Заказчикам',
    items: [
      {
        title: 'Заказ за пару минут',
        text: 'Задача, город и бюджет. Можно указать «по договорённости».',
        status: 'live',
      },
      {
        title: 'Отклики в одном списке',
        text: 'Цена и срок от каждого мастера, без звонков и переписок.',
        status: 'live',
      },
      {
        title: 'Профили исполнителей',
        text: 'Опыт, специализации и города работы до того, как вы выберете.',
        status: 'live',
      },
      {
        title: 'Безопасная сделка',
        text: 'Оплата по этапам через платёжного провайдера, после вашей приёмки.',
        status: 'soon',
      },
    ],
  },
  {
    key: 'contractors',
    label: 'Мастерам и бригадам',
    items: [
      {
        title: 'Каталог заказов',
        text: 'Бюджет, город и описание работ видны сразу, фильтр по категориям.',
        status: 'live',
      },
      {
        title: 'Свои условия',
        text: 'Отклик с вашей ценой и сроком. Заказчик сравнивает предложения честно.',
        status: 'live',
      },
      {
        title: 'Профиль мастера',
        text: 'Опыт, категории работ и города, в которых вы работаете.',
        status: 'live',
      },
      {
        title: 'Оплата после приёмки',
        text: 'Деньги за этап будут зарезервированы до начала работ.',
        status: 'soon',
      },
    ],
  },
];

/** Переключатель «Заказчикам / Мастерам»: вкладки с навигацией стрелками. */
export function AudienceSwitch() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next =
      (active + (event.key === 'ArrowRight' ? 1 : -1) + AUDIENCES.length) % AUDIENCES.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  const current = AUDIENCES[active]!;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Для кого"
        onKeyDown={onKeyDown}
        className="inline-flex rounded-full border border-line bg-surface p-1 landing-shadow"
      >
        {AUDIENCES.map((audience, i) => {
          const selected = i === active;
          return (
            <button
              key={audience.key}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={`relative min-h-11 rounded-full px-4 text-sm font-semibold transition-colors duration-200 sm:px-5 ${
                selected ? 'text-canvas' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId={`${id}-pill`}
                  className="absolute inset-0 rounded-full bg-ink"
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                />
              ) : null}
              <span className="relative">{audience.label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${active}`}
        className="mt-10"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.ul
            key={current.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="grid gap-x-10 gap-y-2 sm:grid-cols-2"
          >
            {current.items.map((item, i) => (
              <li key={item.title} className="flex gap-5 border-t border-line py-6">
                <span className="font-display w-8 shrink-0 text-sm font-semibold tabular-nums text-ink-soft/70">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h3 className="text-lg font-semibold tracking-[-0.01em]">{item.title}</h3>
                    <StatusPill status={item.status} />
                  </div>
                  <p className="mt-2 leading-relaxed text-ink-soft">{item.text}</p>
                </div>
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      </div>
    </div>
  );
}
