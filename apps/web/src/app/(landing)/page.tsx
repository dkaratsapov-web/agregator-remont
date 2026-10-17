import { JOB_CATEGORY_LABELS } from '@agregator/shared';
import { LandingHeader } from '@/components/landing/landing-header';
import { Manifesto } from '@/components/landing/manifesto';
import { Preloader } from '@/components/landing/preloader';
import { Reveal } from '@/components/landing/reveal';
import { SpotlightCard } from '@/components/landing/spotlight-card';
import { StatusPill, type FeatureStatus } from '@/components/landing/status-pill';
import { PrimaryCta, Story } from '@/components/landing/story';
import { Wordmark } from '@/components/landing/wordmark';

const CATEGORIES = Object.values(JOB_CATEGORY_LABELS).filter((label) => label !== 'Другое');

function SectionHead({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <Reveal className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
      <h2 className="font-display mt-4 text-3xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-[2.6rem]">
        {title}
      </h2>
      {text ? <p className="mt-5 text-lg leading-relaxed text-ink-soft">{text}</p> : null}
    </Reveal>
  );
}

function Feature({
  title,
  text,
  status,
  className = '',
  children,
}: {
  title: string;
  text: string;
  status: FeatureStatus;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <SpotlightCard
      className={`landing-shadow flex flex-col rounded-[22px] border border-line/70 bg-surface p-6 sm:p-7 ${className}`}
    >
      <div className="self-start">
        <StatusPill status={status} />
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-[-0.015em]">{title}</h3>
      <p className="mt-2 max-w-[34rem] leading-relaxed text-ink-soft">{text}</p>
      {children ? <div className="mt-auto pt-8">{children}</div> : null}
    </SpotlightCard>
  );
}

function SafeDealFlow() {
  const nodes = ['Заказчик', 'Платёжный провайдер', 'Мастер'];
  return (
    <div aria-hidden="true" className="rounded-2xl bg-canvas p-5">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-ink-soft sm:text-xs">
        {nodes.map((node, i) => (
          <span
            key={node}
            className={`rounded-full px-3 py-1.5 ${i === 1 ? 'bg-ink text-canvas' : 'border border-line bg-surface'}`}
          >
            {node}
          </span>
        ))}
      </div>
      <div className="flow-line mx-6 mt-4" />
      <div className="mt-3 flex justify-between px-1 text-[11px] text-ink-soft">
        <span>оплата этапа</span>
        <span>после приёмки</span>
      </div>
    </div>
  );
}

function BidsPreview() {
  const rows = [
    ['Мастер Олег Т.', '395 000 ₽', '24 дня'],
    ['Бригада Андрея В.', '420 000 ₽', '30 дней'],
    ['Студия «Линия»', '470 000 ₽', '21 день'],
  ];
  return (
    <div aria-hidden="true" className="divide-y divide-line rounded-2xl bg-canvas px-4 text-sm">
      {rows.map(([name, price, days]) => (
        <div key={name} className="flex items-center justify-between gap-3 py-2.5">
          <span className="truncate font-medium">{name}</span>
          <span className="flex shrink-0 gap-3 tabular-nums text-ink-soft">
            <span className="font-semibold text-ink">{price}</span>
            {days}
          </span>
        </div>
      ))}
      <p className="py-2 text-right text-[11px] text-ink-soft">пример</p>
    </div>
  );
}

function StagesPreview() {
  const stages = [
    { name: 'Демонтаж', fill: 'w-full' },
    { name: 'Черновые', fill: 'w-2/3' },
    { name: 'Чистовая', fill: 'w-0' },
  ];
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-2">
      {stages.map((stage) => (
        <div key={stage.name}>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className={`h-full rounded-full bg-accent ${stage.fill}`} />
          </div>
          <p className="mt-2 text-xs font-medium text-ink-soft">{stage.name}</p>
        </div>
      ))}
    </div>
  );
}

const FACTS = [
  { title: 'Серверы в России', text: 'Данные сервиса хранятся в российском дата-центре.' },
  {
    title: 'Доступ по приглашению',
    text: 'Сейчас идёт закрытое тестирование с первыми пользователями.',
  },
  {
    title: 'Работает с телефона',
    text: 'Веб-версию можно установить на главный экран как приложение.',
  },
];

export default function LandingPage() {
  return (
    <>
      <Preloader />
      <span id="top" aria-hidden="true" className="absolute top-0" />
      <LandingHeader />
      <main id="main">
        <Story />

        {/* Возможности */}
        <section id="features" className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8 lg:py-36">
          <SectionHead
            eyebrow="Возможности"
            title="Что уже работает и что на подходе"
            text="Помечаем честно: бета открыта для тестирования, часть функций ещё в разработке."
          />
          <div className="mt-14 grid gap-4 md:grid-cols-6">
            <Reveal className="md:col-span-4 md:row-span-2">
              <Feature
                className="h-full"
                status="soon"
                title="Безопасная сделка"
                text="Деньги за этап будут храниться у платёжного провайдера и перейдут мастеру только после вашей приёмки."
              >
                <SafeDealFlow />
              </Feature>
            </Reveal>
            <Reveal className="md:col-span-2" delay={0.06}>
              <Feature
                className="h-full"
                status="live"
                title="Отклики с ценой и сроком"
                text="Каждый мастер называет свою цену и срок."
              >
                <BidsPreview />
              </Feature>
            </Reveal>
            <Reveal className="md:col-span-2" delay={0.12}>
              <Feature
                className="h-full"
                status="soon"
                title="Поэтапная оплата"
                text="Демонтаж, черновые работы, чистовая отделка."
              >
                <StagesPreview />
              </Feature>
            </Reveal>
            <Reveal className="md:col-span-2">
              <Feature
                className="h-full"
                status="soon"
                title="Чат и фото-отчёты"
                text="Переписка с мастером и фото после каждого этапа в карточке заказа."
              />
            </Reveal>
            <Reveal className="md:col-span-2" delay={0.06}>
              <Feature
                className="h-full"
                status="soon"
                title="Материалы с доставкой"
                text="Заказ материалов у магазинов-партнёров с доставкой прямо на объект."
              />
            </Reveal>
            <Reveal className="md:col-span-2" delay={0.12}>
              <Feature
                className="h-full"
                status="soon"
                title="Приложения iOS и Android"
                text="Пока работает веб-версия: её можно установить на телефон."
              />
            </Reveal>
            <Reveal className="md:col-span-6">
              <Feature
                status="partial"
                title="Защита и модерация"
                text="Защита от перебора паролей и ограничение частоты запросов уже работают. Модерация заказов и отзывов в разработке."
              />
            </Reveal>
          </div>
        </section>

        {/* Категории */}
        <section
          aria-labelledby="categories-title"
          className="border-y border-line bg-surface py-14"
        >
          <h2 id="categories-title" className="sr-only">
            Категории работ
          </h2>
          <div className="marquee overflow-hidden">
            <div className="marquee-track">
              {[0, 1].map((copy) => (
                <ul
                  key={copy}
                  aria-hidden={copy === 1 ? true : undefined}
                  className="flex shrink-0 items-center"
                >
                  {CATEGORIES.map((label) => (
                    <li
                      key={label}
                      className="font-display flex items-center whitespace-nowrap text-2xl font-medium tracking-[-0.03em] text-ink sm:text-4xl"
                    >
                      <span className="px-6 sm:px-9">{label}</span>
                      <span
                        aria-hidden="true"
                        className="size-2 rotate-45 rounded-[2px] bg-accent"
                      />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </section>

        {/* О сервисе */}
        <section id="about" className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8 lg:py-40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">О сервисе</p>
          <div className="mt-6 max-w-5xl">
            <Manifesto text="Мы делаем Гарантыч, чтобы цена и срок ремонта были известны до начала работ, а деньги переходили мастеру только после того, как вы приняли этап." />
          </div>
          <dl className="mt-20 grid gap-10 border-t border-line pt-10 sm:grid-cols-3">
            {FACTS.map((fact, i) => (
              <Reveal key={fact.title} delay={i * 0.08}>
                <dt className="font-semibold">{fact.title}</dt>
                <dd className="mt-2 leading-relaxed text-ink-soft">{fact.text}</dd>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* Призыв */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <Reveal>
            <div className="iso-grid landing-shadow-lg relative overflow-hidden rounded-[28px] border border-line/70 bg-surface px-6 py-16 sm:px-12 sm:py-20 lg:px-16">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-[radial-gradient(closest-side,rgb(194_65_12/0.14),transparent)]"
              />
              <div className="relative max-w-2xl">
                <h2 className="font-display text-3xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl">
                  Сервис в закрытом тестировании
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
                  Если вы получили доступ, войдите в кабинет: разместите заказ или откликнитесь на
                  заказы в каталоге.
                </p>
                <div className="mt-9">
                  <PrimaryCta />
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Wordmark />
          <p>Площадка заказов на ремонт и строительство. Закрытое тестирование, 2026.</p>
        </div>
      </footer>
    </>
  );
}
