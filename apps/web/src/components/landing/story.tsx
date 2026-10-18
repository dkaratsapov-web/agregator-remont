'use client';

import { motion, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useRef } from 'react';
import { FLIGHT_BASE } from '@/lib/flight';
import { FlightCanvas } from './flight-canvas';
import { StatusPill } from './status-pill';
import { useFlightSnap } from './use-flight-snap';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';
import { useViewer } from './viewer';

/**
 * Герой + «Как это работает»: блок закреплён на экране, пока идёт прокрутка трека, а во весь
 * экран идёт пролёт камеры по комнате от «до ремонта» к готовой гостиной (кадр — по прокрутке,
 * lib/flight.ts). При reduced motion трек не закрепляется: фото готовой комнаты и список шагов.
 */

type Step = { title: string; text: string };

const STEPS: Step[] = [
  {
    title: 'Опишите задачу',
    text: 'Что сделать, в каком городе и в какой бюджет. Заказ появится в каталоге, мастера увидят условия.',
  },
  {
    title: 'Получите отклики',
    text: 'Мастера и бригады предлагают свою цену и срок. Все предложения собраны в одном списке.',
  },
  {
    title: 'Выберите исполнителя',
    text: 'Сравните цены, сроки и профили: опыт, специализации, города работы.',
  },
  {
    title: 'Платите по этапам',
    text: 'Демонтаж, черновые работы, чистовая отделка. Деньги будут ждать у платёжного провайдера, пока вы не примете этап.',
  },
];

/**
 * Отрезки прогресса трека: 0 — герой, затем четыре шага. Последний шаг самый длинный: на нём
 * идёт ремонт. Опорные точки пролёта (FLIGHT_KEYS) согласованы с этими отрезками.
 */
const STEP_RANGES: [number, number][] = [
  [0.12, 0.3],
  [0.3, 0.46],
  [0.46, 0.6],
  [0.6, 1.01],
];

const BIDS = [
  { name: 'Бригада Андрея В.', price: '420 000 ₽', days: '30 дней' },
  { name: 'Мастер Олег Т.', price: '395 000 ₽', days: '24 дня' },
  { name: 'Студия «Линия»', price: '470 000 ₽', days: '21 день' },
];

const STAGES = ['Демонтаж', 'Черновые работы', 'Чистовая отделка'];

const HERO_POINTS = [
  'Соединяем заказчиков с мастерами и бригадами',
  'Выступаем гарантом качества выполнения вашего ремонта',
  'Включаемся в решение спорных ситуаций без потери ваших денег',
];

function HeroCopy() {
  const words = ['честный', 'ремонт', 'без', 'лишнего', 'риска!'];
  return (
    <div>
      <h1
        id="hero-title"
        className="font-display text-[2rem] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[2.75rem] lg:text-[3rem] xl:text-[3.2rem]"
      >
        {/* Неразрывный пробел перед тире: тире не уходит в начало строки. */}
        <span className="word-mask word-mask--brand">
          <span style={{ '--i': 0 } as React.CSSProperties}>
            <span className="brand-mark">Гарантыч</span>
            {'\u00a0—'}
          </span>
        </span>{' '}
        {words.map((word, i) => (
          <span key={word}>
            <span className="word-mask">
              <span style={{ '--i': i + 1 } as React.CSSProperties}>{word}</span>
            </span>{' '}
          </span>
        ))}
      </h1>
      <ul
        className="fade-up mt-6 max-w-[32rem] space-y-2.5 text-base leading-snug text-ink-soft sm:text-lg"
        style={{ '--d': '2650ms' } as React.CSSProperties}
      >
        {HERO_POINTS.map((point) => (
          <li key={point} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-accent"
            />
            {point}
          </li>
        ))}
      </ul>
      <div
        className="fade-up mt-7 flex flex-wrap items-center gap-3"
        style={{ '--d': '2800ms' } as React.CSSProperties}
      >
        <PrimaryCta />
        <a
          href="#how-it-works"
          className="inline-flex min-h-12 items-center rounded-full border border-line bg-surface/60 px-5 text-sm font-semibold text-ink transition-colors duration-200 hover:border-ink/25 hover:bg-surface active:scale-[0.97]"
        >
          Как это работает
        </a>
      </div>
    </div>
  );
}

/**
 * Главная кнопка: ведёт в приложение (оно за паролем), обычной ссылкой без prefetch — пароль
 * спрашивается только после нажатия. Гостю — к новому заказу (вход по пути), вошедшему — в кабинет.
 */
export function PrimaryCta({ label = 'Разместить заказ' }: { label?: string }) {
  const viewer = useViewer();
  return (
    <a
      href={viewer ? '/account' : '/account/jobs/new'}
      className="group inline-flex min-h-12 items-center gap-3 rounded-full bg-ink py-1.5 pl-5 pr-1.5 text-sm font-semibold text-canvas transition-[background-color,transform] duration-200 hover:bg-[#1c2536] active:scale-[0.97]"
    >
      {viewer ? 'Перейти в кабинет' : label}
      <span
        aria-hidden="true"
        className="grid size-9 place-items-center rounded-full bg-accent text-accent-ink transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </a>
  );
}

function StepCopy({ step, index }: { step: Step; index: number }) {
  return (
    <div>
      <span className="font-display text-sm font-semibold tabular-nums text-accent">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h3 className="font-display mt-4 text-[1.75rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-4xl lg:text-[2.75rem]">
        {step.title}
      </h3>
      <p className="mt-4 max-w-[28rem] text-base leading-relaxed text-ink-soft sm:text-lg">
        {step.text}
      </p>
    </div>
  );
}

function AnimatedStep({
  step,
  index,
  progress,
}: {
  step: Step;
  index: number;
  progress: MotionValue<number>;
}) {
  const [start, end] = STEP_RANGES[index]!;
  const last = index === STEPS.length - 1;
  const opacity = useTransform(
    progress,
    last ? [start - 0.005, start + 0.04] : [start - 0.005, start + 0.04, end - 0.05, end - 0.015],
    last ? [0, 1] : [0, 1, 1, 0],
  );
  const y = useTransform(
    progress,
    last ? [start - 0.005, start + 0.04] : [start - 0.005, start + 0.04, end - 0.05, end - 0.015],
    last ? [28, 0] : [28, 0, 0, -28],
  );
  return (
    <motion.li className="[grid-area:1/1]" style={{ opacity, y }}>
      <StepCopy step={step} index={index} />
    </motion.li>
  );
}

function RailSegment({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const [start, end] = STEP_RANGES[index]!;
  const fill = useTransform(progress, [start, Math.min(end, 1)], [0, 1]);
  return (
    <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-line">
      <motion.div className="absolute inset-0 origin-left bg-accent" style={{ scaleX: fill }} />
    </div>
  );
}

/** Карточки поверх сцены: заказ, отклики, этапы. Данные в них — пример. */
function Overlays({ progress }: { progress: MotionValue<number> }) {
  const task = useTransform(progress, [0.14, 0.2, 0.44, 0.48], [0, 1, 1, 0]);
  const taskY = useTransform(progress, [0.14, 0.2], [24, 0]);

  const stagesOpacity = useTransform(progress, [0.61, 0.66], [0, 1]);
  const stagesY = useTransform(progress, [0.61, 0.66], [24, 0]);
  // Полоса заполняется вместе с пролётом: демонтаж, черновые и чистовая заканчиваются на трети.
  const stageFill = useTransform(progress, [0.6, 0.71, 0.82, 0.94], [0.04, 0.34, 0.67, 1]);

  return (
    <>
      <motion.div
        className="landing-shadow absolute left-[2%] top-[6%] w-44 rounded-2xl bg-surface p-3 sm:left-[4%] sm:w-60 sm:p-4"
        style={{ opacity: task, y: taskY }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            Заказ
          </span>
          <span className="text-[10px] font-medium text-ink-soft">пример</span>
        </div>
        <p className="mt-1.5 text-sm font-semibold leading-snug sm:text-base">
          Ремонт гостиной, 36 м²
        </p>
        <p className="mt-1 text-xs text-ink-soft sm:text-sm">Москва · до 450 000 ₽</p>
      </motion.div>

      <div className="absolute right-0 top-[4%] flex w-44 flex-col gap-2 sm:top-[10%] sm:w-60 sm:gap-2.5">
        {BIDS.map((bid, i) => (
          <BidCard key={bid.name} bid={bid} index={i} progress={progress} />
        ))}
      </div>

      <motion.div
        className="landing-shadow absolute bottom-[4%] left-1/2 w-[17rem] -translate-x-1/2 rounded-2xl bg-surface p-3.5 sm:w-80 sm:p-4"
        style={{ opacity: stagesOpacity, y: stagesY }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            Оплата по этапам
          </span>
          <StatusPill status="soon" />
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
          <motion.div
            className="h-full origin-left rounded-full bg-accent"
            style={{ scaleX: stageFill }}
          />
        </div>
        <ol className="mt-2.5 grid grid-cols-3 gap-2 text-[11px] font-medium text-ink-soft sm:text-xs">
          {STAGES.map((stage) => (
            <li key={stage}>{stage}</li>
          ))}
        </ol>
      </motion.div>
    </>
  );
}

function BidCard({
  bid,
  index,
  progress,
}: {
  bid: (typeof BIDS)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const chosen = index === 1;
  const inStart = 0.31 + index * 0.025;
  const opacity = useTransform(
    progress,
    [inStart, inStart + 0.05, 0.48, 0.53, 0.6, 0.64],
    chosen ? [0, 1, 1, 1, 1, 0] : [0, 1, 1, 0.32, 0.32, 0],
  );
  const x = useTransform(progress, [inStart, inStart + 0.05], [36, 0]);
  const scale = useTransform(progress, [0.48, 0.53], [1, chosen ? 1.04 : 0.97]);
  const ring = useTransform(progress, [0.48, 0.53], [0, 1]);
  return (
    <motion.div
      className="landing-shadow relative rounded-2xl bg-surface p-3 sm:p-3.5"
      style={{ opacity, x, scale }}
    >
      {chosen ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-2xl ring-2 ring-accent"
          style={{ opacity: ring }}
        />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-semibold sm:text-sm">{bid.name}</p>
        {chosen ? (
          <motion.span
            className="shrink-0 rounded-full bg-accent-tint px-2 py-0.5 text-[10px] font-semibold text-accent-hover"
            style={{ opacity: ring }}
          >
            Выбран
          </motion.span>
        ) : null}
      </div>
      <p className="mt-1 flex items-baseline justify-between text-xs text-ink-soft sm:text-sm">
        <span className="font-semibold tabular-nums text-ink">{bid.price}</span>
        <span className="tabular-nums">{bid.days}</span>
      </p>
    </motion.div>
  );
}

function ScrollyStory() {
  const track = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });
  // Без остановок на полпути: после прокрутки страница сама доезжает до шага.
  useFlightSnap(track);

  const heroOpacity = useTransform(progress, [0, 0.06, 0.1], [1, 1, 0]);
  const heroY = useTransform(progress, [0, 0.1], [0, -48]);
  const heroPointer = useTransform(heroOpacity, (v) => (v < 0.3 ? 'none' : 'auto'));
  const cueOpacity = useTransform(progress, [0, 0.04], [1, 0]);

  return (
    <section ref={track} aria-labelledby="hero-title" className="relative h-[520vh] lg:h-[600vh]">
      {/* Якорь «Как это работает» указывает на первый шаг внутри трека. */}
      <span id="how-it-works" aria-hidden="true" className="absolute left-0 top-[12%]" />
      <div className="sticky top-0 h-svh overflow-hidden">
        <FlightCanvas progress={progress} />
        <div aria-hidden="true" className="flight-scrim pointer-events-none absolute inset-0" />
        <motion.div
          aria-hidden="true"
          className="flight-scrim-hero pointer-events-none absolute inset-0"
          style={{ opacity: heroOpacity }}
        />
        <div className="relative mx-auto grid h-full max-w-[1600px] grid-rows-[minmax(0,1fr)_auto] gap-2 px-4 pb-10 pt-16 sm:px-6 lg:grid-cols-12 lg:grid-rows-1 lg:items-center lg:gap-8 lg:px-10 lg:pb-0 lg:pt-16">
          <div className="relative order-2 grid lg:order-1 lg:col-span-6">
            <motion.div
              className="relative z-10 [grid-area:1/1]"
              style={{ opacity: heroOpacity, y: heroY, pointerEvents: heroPointer }}
            >
              <HeroCopy />
            </motion.div>
            <h2 className="sr-only">Как это работает</h2>
            <ol className="pointer-events-none grid self-end [grid-area:1/1] lg:self-center">
              {STEPS.map((step, i) => (
                <AnimatedStep key={step.title} step={step} index={i} progress={progress} />
              ))}
            </ol>
          </div>

          <div className="relative order-1 min-h-0 lg:order-2 lg:col-span-6 lg:h-[min(640px,80svh)]">
            <Overlays progress={progress} />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          <div className="mx-auto flex max-w-[1600px] items-end justify-between gap-6 px-4 pb-5 sm:px-6 lg:px-10 lg:pb-7">
            <div className="flex w-full max-w-xs gap-1.5 lg:max-w-sm" aria-hidden="true">
              {STEPS.map((step, i) => (
                <RailSegment key={step.title} index={i} progress={progress} />
              ))}
            </div>
            <motion.div
              className="hidden items-center gap-3 rounded-full bg-surface/80 px-4 py-2 text-xs font-medium text-ink-soft backdrop-blur-md lg:flex"
              style={{ opacity: cueOpacity }}
            >
              Прокрутите
              <span className="scroll-cue" />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Статичная версия для reduced motion: фото готовой комнаты и обычный список шагов. */
function StaticStory() {
  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto max-w-[1600px] px-4 pt-24 sm:px-6 lg:px-10"
    >
      <div className="grid items-center gap-8 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <HeroCopy />
        </div>
        <div className="lg:col-span-6">
          {/* Статичный файл из public, next/image не нужен. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${FLIGHT_BASE}/final.webp`}
            alt="Гостиная после ремонта: терракотовый диван, торшер и растение у окна в вечернем свете"
            width={1920}
            height={1072}
            className="landing-shadow aspect-video w-full rounded-[28px] object-cover"
          />
        </div>
      </div>
      <h2
        id="how-it-works"
        className="font-display mt-20 text-3xl font-semibold tracking-[-0.03em]"
      >
        Как это работает
      </h2>
      <ol className="mt-10 grid gap-12 md:grid-cols-2">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <StepCopy step={step} index={i} />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Story() {
  const reduce = usePrefersReducedMotion();
  return reduce ? <StaticStory /> : <ScrollyStory />;
}
