'use client';

import { motion, useInView, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useRef, useSyncExternalStore } from 'react';
import { StatusPill, type FeatureStatus } from './status-pill';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

/**
 * «Наши главные преимущества» (фишки из КП): стопка крупных карточек. На десктопе каждая
 * карточка закрепляется, следующая наезжает на неё, а предыдущие уменьшаются и уходят назад.
 * На телефоне и при reduced motion — обычный список с появлением. У каждой карточки своя
 * сцена; она запускается при попадании в экран (data-on), циклы только CSS. Статусы честные,
 * суммы — пример.
 */

/* ---------- Мини-сцены ---------- */

function SafeDealScene() {
  return (
    <div
      aria-hidden="true"
      className="deal-grid absolute inset-0 flex flex-col justify-center px-6 pt-8 sm:px-10 sm:pt-0"
    >
      <p className="absolute left-5 top-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 sm:left-7 sm:top-7">
        Как будет работать
      </p>
      <div className="relative">
        <div className="flex items-end justify-between">
          {[
            { label: 'Вы', sub: 'оплачиваете этап' },
            { label: 'Платёжный провайдер', sub: 'хранит деньги', vault: true },
            { label: 'Мастер', sub: 'получает после приёмки' },
          ].map((node) => (
            <div key={node.label} className="flex w-24 flex-col items-center text-center sm:w-36">
              <div
                className={`grid place-items-center rounded-2xl ${
                  node.vault
                    ? 'deal-vault size-16 bg-[#c2410c] sm:size-20'
                    : 'size-12 bg-white/10 ring-1 ring-white/15 sm:size-14'
                }`}
              >
                {node.vault ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="size-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
                    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <span className="size-2.5 rounded-full bg-white/70" />
                )}
              </div>
              <p className="mt-3 text-xs font-semibold text-white sm:text-sm">{node.label}</p>
              <p className="mt-0.5 text-[11px] text-white/50 sm:text-xs">{node.sub}</p>
            </div>
          ))}
        </div>

        {/* Дорожка и «монета», которая идёт к провайдеру, ждёт приёмки и уходит мастеру */}
        <div className="pointer-events-none absolute inset-x-12 top-6 sm:inset-x-[4.5rem] sm:top-7">
          <div className="h-px w-full bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.28)_0_6px,transparent_6px_11px)]" />
          <div className="deal-coin absolute inset-x-0 top-0">
            <span className="absolute -left-2 -top-2 grid size-4 place-items-center rounded-full bg-[#f6c9a8] shadow-[0_0_0_5px_rgb(194_65_12/0.35),0_0_24px_rgb(246_201_168/0.8)]" />
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-2 text-[11px] font-semibold sm:text-xs">
        <span className="deal-chip deal-chip--1 rounded-full bg-white/10 px-3 py-1.5 text-white/85 ring-1 ring-white/15">
          Деньги зарезервированы
        </span>
        <span className="deal-chip deal-chip--2 rounded-full bg-[#15803d]/25 px-3 py-1.5 text-[#86efac] ring-1 ring-[#86efac]/25">
          Этап принят
        </span>
        <span className="deal-chip deal-chip--3 rounded-full bg-[#c2410c]/30 px-3 py-1.5 text-[#fdba8c] ring-1 ring-[#fdba8c]/30">
          Выплата мастеру
        </span>
      </div>
    </div>
  );
}

function StagesScene() {
  const stages = [
    { name: 'Демонтаж', sum: '60 000 ₽', fill: 1, note: 'принят' },
    { name: 'Черновые работы', sum: '180 000 ₽', fill: 0.62, note: 'в работе' },
    { name: 'Чистовая отделка', sum: '210 000 ₽', fill: 0, note: 'впереди' },
  ];
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col justify-center gap-3.5 px-5 sm:px-7"
    >
      {stages.map((stage, i) => (
        <div key={stage.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold text-ink">{stage.name}</span>
            <span className="tabular-nums text-ink-soft">{stage.sum}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken">
            <div
              className="stage-bar h-full origin-left rounded-full bg-accent"
              style={{ '--fill': stage.fill, '--d': `${200 + i * 350}ms` } as React.CSSProperties}
            />
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-ink-soft">{stage.note}</p>
        </div>
      ))}
      <p className="absolute bottom-3 right-4 text-[10px] text-ink-soft/80">пример</p>
    </div>
  );
}

function BidsScene() {
  const bids = [
    { name: 'Студия «Линия»', price: '470 000 ₽', days: '21 день' },
    { name: 'Бригада Андрея В.', price: '420 000 ₽', days: '30 дней' },
    { name: 'Мастер Олег Т.', price: '395 000 ₽', days: '24 дня' },
  ];
  return (
    <div aria-hidden="true" className="absolute inset-0 grid place-items-center px-5">
      <div className="relative h-52 w-full max-w-[19rem]">
        {bids.map((bid, i) => (
          <div
            key={bid.name}
            className="bid-fan landing-shadow absolute inset-x-0 top-1/2 rounded-2xl bg-surface p-3.5"
            style={{ '--i': i } as React.CSSProperties}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{bid.name}</span>
              {i === 2 ? (
                <span className="shrink-0 rounded-full bg-accent-tint px-2 py-0.5 text-[10px] font-semibold text-accent-hover">
                  Выбран
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between text-sm">
              <span className="font-semibold tabular-nums">{bid.price}</span>
              <span className="tabular-nums text-ink-soft">{bid.days}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="absolute bottom-3 right-4 text-[10px] text-ink-soft/80">пример</p>
    </div>
  );
}

function MaterialsScene() {
  const reduce = usePrefersReducedMotion();
  const route = 'M34 112 C 90 112, 96 44, 160 52 S 236 98, 276 42';
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <svg
        viewBox="0 0 310 150"
        className="absolute inset-0 size-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <path d={route} fill="none" stroke="var(--line)" strokeWidth="6" strokeLinecap="round" />
        <path
          className="route-draw"
          d={route}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeDasharray="5 7"
          strokeLinecap="round"
        />
        <g>
          <rect x="14" y="94" width="40" height="34" rx="8" fill="var(--ink)" />
          <path
            d="M22 106h24M22 114h16"
            stroke="#fff"
            strokeOpacity="0.7"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        <g>
          <path
            d="M258 46 276 30l18 16v18h-36z"
            fill="var(--surface)"
            stroke="var(--ink)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <rect x="271" y="50" width="10" height="14" fill="var(--accent)" />
        </g>
        <circle
          r="7"
          fill="var(--accent)"
          stroke="var(--surface)"
          strokeWidth="3"
          cx={reduce ? 160 : undefined}
          cy={reduce ? 52 : undefined}
        >
          {reduce ? null : (
            <animateMotion
              dur="4.5s"
              repeatCount="indefinite"
              path={route}
              keyPoints="0;1"
              keyTimes="0;1"
              calcMode="spline"
              keySplines="0.45 0 0.25 1"
            />
          )}
        </circle>
      </svg>
      <span className="absolute left-4 top-4 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink ring-1 ring-line">
        Магазин-партнёр
      </span>
      <span className="absolute bottom-4 right-4 rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-canvas">
        Доставка на объект
      </span>
    </div>
  );
}

function ChatScene() {
  return (
    <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-center gap-2.5 px-5">
      <div
        className="chat-pop max-w-[85%] self-start rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-[13px] leading-snug ring-1 ring-line"
        style={{ '--d': '150ms' } as React.CSSProperties}
      >
        Стяжка готова, фото этапа ниже
      </div>
      <div
        className="chat-pop flex gap-1.5 self-start"
        style={{ '--d': '550ms' } as React.CSSProperties}
      >
        {[
          'from-[#d6d3cd] to-[#b9b4ab]',
          'from-[#e8ddd0] to-[#cdb89c]',
          'from-[#dfe4ea] to-[#b8c2ce]',
        ].map((tone) => (
          <span
            key={tone}
            className={`size-12 rounded-xl bg-gradient-to-br ${tone} ring-1 ring-black/5`}
          />
        ))}
      </div>
      <div
        className="chat-pop max-w-[70%] self-end rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[13px] leading-snug text-canvas"
        style={{ '--d': '950ms' } as React.CSSProperties}
      >
        Принимаю этап
      </div>
    </div>
  );
}

function AppsScene() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 grid place-items-center [perspective:900px]"
    >
      <div className="phone-float relative h-44 w-24 rounded-[22px] bg-ink p-1.5 shadow-[0_24px_40px_-18px_rgb(13_19_32/0.55)]">
        <div className="flex size-full flex-col gap-1.5 rounded-[17px] bg-surface p-2">
          <div className="mx-auto h-1 w-8 rounded-full bg-sunken" />
          <div className="mt-1 h-2 w-12 rounded-full bg-ink" />
          <div className="h-1.5 w-14 rounded-full bg-sunken" />
          <div className="mt-1 h-10 rounded-lg bg-accent-tint" />
          <div className="h-6 rounded-md bg-sunken" />
          <div className="h-6 rounded-md bg-sunken" />
          <div className="mt-auto h-5 rounded-full bg-ink" />
        </div>
      </div>
      <div className="absolute bottom-4 flex gap-2 text-[11px] font-semibold">
        <span className="rounded-full bg-surface px-2.5 py-1 ring-1 ring-line">iOS</span>
        <span className="rounded-full bg-surface px-2.5 py-1 ring-1 ring-line">
          Android · RuStore
        </span>
      </div>
    </div>
  );
}

function ProtectionScene() {
  const rows: { label: string; state: string; ok: boolean }[] = [
    { label: 'Перебор паролей', state: 'блокируется', ok: true },
    { label: 'Частота запросов', state: 'ограничена', ok: true },
    { label: 'Данные', state: 'на серверах в России', ok: true },
    { label: 'Модерация заказов и отзывов', state: 'в разработке', ok: false },
  ];
  return (
    <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-center px-5 sm:px-8">
      <ul className="divide-y divide-line/80 rounded-2xl bg-surface px-4 ring-1 ring-line/80">
        {rows.map((row, i) => (
          <li
            key={row.label}
            className="log-row flex items-center justify-between gap-3 py-3 text-sm"
            style={{ '--d': `${150 + i * 220}ms` } as React.CSSProperties}
          >
            <span className="flex items-center gap-2.5 font-medium">
              <span className={`size-2 rounded-full ${row.ok ? 'bg-ok' : 'bg-ink-soft/40'}`} />
              {row.label}
            </span>
            <span className={`text-right text-xs ${row.ok ? 'text-ok' : 'text-ink-soft'}`}>
              {row.state}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Tone = 'dark' | 'light' | 'accent' | 'tint';

type Feature = {
  status: FeatureStatus;
  title: string;
  text: string;
  tone: Tone;
  visual: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    status: 'soon',
    title: 'Безопасная сделка',
    text: 'Деньги за этап хранятся у платёжного провайдера и переходят мастеру только после вашей приёмки.',
    tone: 'dark',
    visual: <SafeDealScene />,
  },
  {
    status: 'soon',
    title: 'Поэтапная оплата',
    text: 'Демонтаж, черновые работы, чистовая отделка: вы платите за каждый этап отдельно и видите, что уже сделано.',
    tone: 'light',
    visual: <StagesScene />,
  },
  {
    status: 'live',
    title: 'Отклики с ценой и сроком',
    text: 'Мастера и бригады называют свою цену и срок. Вы сравниваете предложения в одном списке и выбираете.',
    tone: 'accent',
    visual: <BidsScene />,
  },
  {
    status: 'soon',
    title: 'Материалы с доставкой',
    text: 'Заказ материалов у магазинов-партнёров с доставкой прямо на объект, без поездок по строительным рынкам.',
    tone: 'light',
    visual: <MaterialsScene />,
  },
  {
    status: 'soon',
    title: 'Чат и фото-отчёты',
    text: 'Переписка с мастером и фото после каждого этапа хранятся в карточке заказа.',
    tone: 'tint',
    visual: <ChatScene />,
  },
  {
    status: 'soon',
    title: 'Приложения iOS и Android',
    text: 'Пока работает веб-версия: её можно установить на телефон как приложение.',
    tone: 'light',
    visual: <AppsScene />,
  },
  {
    status: 'partial',
    title: 'Модерация и защита',
    text: 'Защита от перебора паролей и ограничение частоты запросов уже работают. Модерация заказов и отзывов в разработке.',
    tone: 'light',
    visual: <ProtectionScene />,
  },
];

const TONES: Record<Tone, { card: string; soft: string; panel: string; index: string }> = {
  dark: {
    card: 'feature-card--dark bg-[#0d1320] text-[#eef1f6]',
    soft: 'text-white/65',
    panel: 'bg-white/[0.04] ring-1 ring-white/10',
    index: 'text-white/10',
  },
  light: {
    card: 'bg-surface text-ink',
    soft: 'text-ink-soft',
    panel: 'bg-canvas ring-1 ring-line/70',
    index: 'text-ink/[0.06]',
  },
  accent: {
    card: 'bg-[#c2410c] text-white',
    soft: 'text-white/80',
    panel: 'bg-canvas ring-1 ring-black/10',
    index: 'text-white/15',
  },
  tint: {
    card: 'bg-[#fbeee5] text-ink',
    soft: 'text-ink-soft',
    panel: 'bg-surface ring-1 ring-[#efd9c9]',
    index: 'text-[#c2410c]/10',
  },
};

const DESKTOP = '(min-width: 1024px)';

/** Стопка включается только на десктопе и без reduced motion; на сервере — выключена. */
function useStacked(): boolean {
  const desktop = useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
  const reduce = usePrefersReducedMotion();
  return desktop && !reduce;
}

function FeatureCard({
  feature,
  index,
  total,
  progress,
  stacked,
}: {
  feature: Feature;
  index: number;
  total: number;
  progress: MotionValue<number>;
  stacked: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -20% 0px' });
  const tone = TONES[feature.tone];
  // Чем раньше карточка, тем сильнее она уменьшается, пока на неё наезжают следующие.
  const targetScale = 1 - (total - 1 - index) * 0.035;
  const scale = useTransform(progress, [index / total, 1], [1, targetScale]);

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }

  return (
    <div className="lg:sticky lg:top-0 lg:flex lg:h-[92svh] lg:items-center">
      <motion.article
        ref={ref}
        data-on={inView}
        onPointerMove={onPointerMove}
        style={stacked ? { scale, top: `${index * 16}px` } : undefined}
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '0px 0px -12% 0px' }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={`feature-card spotlight relative grid w-full origin-top overflow-hidden rounded-[32px] p-2 shadow-[0_-12px_40px_-24px_rgb(13_19_32/0.35),0_30px_60px_-30px_rgb(13_19_32/0.35)] lg:h-[min(620px,80svh)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] ${tone.card}`}
      >
        <div className="relative flex flex-col p-6 sm:p-8 lg:p-10">
          <span
            aria-hidden="true"
            className={`font-display pointer-events-none absolute -left-2 top-14 hidden select-none lg:block text-[9rem] font-semibold leading-none tracking-[-0.06em] lg:text-[13rem] ${tone.index}`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="relative flex items-center justify-between gap-3">
            <span className="font-display text-sm font-semibold tabular-nums opacity-70">
              {String(index + 1).padStart(2, '0')}
              <span className="opacity-50"> / {String(total).padStart(2, '0')}</span>
            </span>
            <StatusPill status={feature.status} />
          </div>
          <h3 className="font-display relative mt-10 text-[1.9rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-4xl lg:mt-auto xl:text-[3.1rem]">
            {feature.title}
          </h3>
          <p
            className={`relative mt-5 max-w-[30rem] text-base leading-relaxed sm:text-lg ${tone.soft}`}
          >
            {feature.text}
          </p>
          <div className="lg:h-6" />
        </div>
        <div
          className={`relative min-h-72 overflow-hidden rounded-[26px] sm:min-h-80 lg:min-h-0 ${tone.panel}`}
        >
          <div className="absolute inset-0">{feature.visual}</div>
        </div>
      </motion.article>
    </div>
  );
}

const LEGEND: FeatureStatus[] = ['live', 'partial', 'soon'];

export function Features() {
  const stack = useRef<HTMLDivElement>(null);
  const stacked = useStacked();
  const { scrollYProgress } = useScroll({ target: stack, offset: ['start start', 'end end'] });

  return (
    <section id="features" className="mx-auto max-w-[1560px] px-4 py-28 sm:px-6 lg:px-10 lg:py-36">
      <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
        <motion.div
          className="max-w-4xl"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '0px 0px -12% 0px' }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Возможности
          </p>
          <h2 className="font-display mt-4 text-[2.3rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-[4.6rem]">
            Наши главные преимущества
          </h2>
        </motion.div>
        <div className="flex flex-wrap gap-2" aria-label="Обозначения">
          {LEGEND.map((status) => (
            <StatusPill key={status} status={status} />
          ))}
        </div>
      </div>

      <div ref={stack} className="relative mt-14 flex flex-col gap-4 lg:mt-6 lg:gap-0">
        {FEATURES.map((feature, i) => (
          <FeatureCard
            key={feature.title}
            feature={feature}
            index={i}
            total={FEATURES.length}
            progress={scrollYProgress}
            stacked={stacked}
          />
        ))}
      </div>
    </section>
  );
}
