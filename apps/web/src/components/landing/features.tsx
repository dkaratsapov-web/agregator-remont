'use client';

import { motion, useInView, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useRef, useSyncExternalStore } from 'react';
import { StatusPill, type FeatureStatus } from './status-pill';
import {
  AppsScene,
  BidsScene,
  ChatScene,
  MaterialsScene,
  ProtectionScene,
  SafeDealScene,
  StagesScene,
} from './feature-scenes';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

/**
 * «Наши главные преимущества» (фишки из КП): стопка крупных карточек. На десктопе каждая
 * карточка закрепляется, следующая наезжает на неё, а предыдущие уменьшаются и уходят назад.
 * На телефоне и при reduced motion — обычный список с появлением. У каждой карточки своя
 * сцена; она запускается при попадании в экран (data-on), циклы только CSS. Статусы честные,
 * суммы — пример.
 */

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
          className={`scene-panel relative min-h-80 overflow-hidden rounded-[26px] sm:min-h-96 lg:min-h-0 ${tone.panel}`}
        >
          <div className="absolute inset-0">{feature.visual}</div>
        </div>
      </motion.article>
    </div>
  );
}

export function Features() {
  const stack = useRef<HTMLDivElement>(null);
  const stacked = useStacked();
  const { scrollYProgress } = useScroll({ target: stack, offset: ['start start', 'end end'] });

  return (
    <section id="features" className="mx-auto max-w-[1600px] px-4 py-28 sm:px-6 lg:px-10 lg:py-36">
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
