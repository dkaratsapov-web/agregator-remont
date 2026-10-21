'use client';

import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

/**
 * Сцены карточек «Наших главных преимуществ»: крупные макеты интерфейса с глубиной (основное
 * окно и всплывающие поверх него карточки). Каждая сцена нарисована на холсте 520×400 и
 * масштабируется под ширину панели (.scene-canvas в landing.css). Все данные — пример.
 */

function Canvas({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={`scene-canvas ${className}`}>
      {children}
    </div>
  );
}

function Avatar({ letter, tone = 'ink' }: { letter: string; tone?: 'ink' | 'accent' | 'soft' }) {
  const tones = {
    ink: 'bg-ink text-canvas',
    accent: 'bg-accent text-accent-ink',
    soft: 'bg-[#e6e1da] text-ink',
  };
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${tones[tone]}`}
    >
      {letter}
    </span>
  );
}

function Check({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
    >
      <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Lock({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
    </svg>
  );
}

const Example = ({ dark = false }: { dark?: boolean }) => (
  <span
    className={`absolute bottom-3 right-4 z-10 text-[10px] font-medium ${dark ? 'text-white/40' : 'text-ink-soft/70'}`}
    aria-hidden="true"
  >
    пример
  </span>
);

/* ---------- 01. Безопасная сделка ---------- */

export function SafeDealScene() {
  const steps = [
    { title: 'Вы оплатили этап', sub: 'Сегодня, 10:12', cls: 'deal-chip--1' },
    { title: 'Деньги у провайдера', sub: 'Ждут вашей приёмки', cls: 'deal-chip--2' },
    { title: 'Выплата мастеру', sub: 'После того как вы приняли этап', cls: 'deal-chip--3' },
  ];
  return (
    <div className="deal-grid absolute inset-0">
      <Canvas>
        <div className="absolute left-[14px] top-[30px] w-[340px] rounded-[22px] bg-[#151c2c] p-6 text-white shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.08)] ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Этап 2 из 3
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
              <Lock className="size-3.5" /> Защищено
            </span>
          </div>
          <p className="mt-3 text-[17px] font-semibold">Черновые работы</p>
          <p className="font-display mt-1 text-[38px] font-semibold tracking-[-0.03em] tabular-nums">
            180 000 ₽
          </p>
          <ol className="mt-5 space-y-3.5">
            {steps.map((step, i) => (
              <li key={step.title} className={`deal-chip ${step.cls} flex items-start gap-3`}>
                <span
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
                    i === 1 ? 'deal-vault bg-[#c2410c] text-white' : 'bg-white/12 text-white'
                  }`}
                >
                  {i === 1 ? <Lock className="size-3.5" /> : <Check className="size-3" />}
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">{step.title}</span>
                  <span className="block text-[12px] text-white/50">{step.sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="chat-pop absolute right-0 top-[236px] w-[200px] rounded-2xl bg-[#fbfbfc] p-4 text-ink shadow-[0_30px_60px_-20px_rgb(0_0_0/0.7)]">
          <p className="text-[13px] font-semibold">Работы по этапу готовы</p>
          <p className="mt-1 text-[12px] leading-snug text-ink-soft">
            Проверьте и примите этап, чтобы мастер получил оплату.
          </p>
          <div className="mt-3 flex gap-2">
            <span className="flex-1 rounded-lg bg-accent py-2 text-center text-[12px] font-semibold text-accent-ink">
              Принять этап
            </span>
            <span className="rounded-lg bg-[#eceef1] px-3 py-2 text-[12px] font-semibold">
              Спор
            </span>
          </div>
        </div>
      </Canvas>
      <Example dark />
    </div>
  );
}

/* ---------- 02. Поэтапная оплата ---------- */

export function StagesScene() {
  const stages = [
    { name: 'Демонтаж', sum: '60 000 ₽', fill: 1, state: 'Принят', tone: 'bg-ok-tint text-ok' },
    {
      name: 'Черновые работы',
      sum: '180 000 ₽',
      fill: 0.62,
      state: 'В работе',
      tone: 'bg-accent-tint text-accent-hover',
    },
    {
      name: 'Чистовая отделка',
      sum: '210 000 ₽',
      fill: 0,
      state: 'Впереди',
      tone: 'bg-[#eceef1] text-ink-soft',
    },
  ];
  return (
    <div className="absolute inset-0">
      <Canvas className="text-ink">
        <div className="landing-shadow absolute left-[20px] top-[48px] w-[420px] rounded-[22px] bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                Ремонт кухни · 14 м²
              </p>
              <p className="font-display mt-2 text-[30px] font-semibold tracking-[-0.03em] tabular-nums">
                450 000 ₽
              </p>
              <p className="text-[13px] text-ink-soft">оплачено 60 000 ₽ за принятый этап</p>
            </div>
          </div>
          <ul className="mt-5 space-y-3">
            {stages.map((stage, i) => (
              <li key={stage.name} className="rounded-2xl bg-canvas p-3.5 ring-1 ring-line/70">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-semibold">
                    <span className="mr-2 tabular-nums text-ink-soft">{i + 1}</span>
                    {stage.name}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stage.tone}`}
                  >
                    {stage.state}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e3e6ea]">
                    <div
                      className="stage-bar h-full origin-left rounded-full bg-accent"
                      style={
                        { '--fill': stage.fill, '--d': `${200 + i * 300}ms` } as React.CSSProperties
                      }
                    />
                  </div>
                  <span className="text-[12px] tabular-nums text-ink-soft">{stage.sum}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="chat-pop landing-shadow absolute right-[6px] top-[18px] flex items-center gap-3 rounded-2xl bg-surface py-3 pl-3 pr-4"
          style={{ '--d': '900ms' } as React.CSSProperties}
        >
          <span className="grid size-9 place-items-center rounded-full bg-ok text-white">
            <Check className="size-4" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold">Этап «Демонтаж» принят</span>
            <span className="block text-[12px] text-ink-soft">60 000 ₽ ушли мастеру</span>
          </span>
        </div>
      </Canvas>
      <Example />
    </div>
  );
}

/* ---------- 03. Отклики с ценой и сроком ---------- */

export function BidsScene() {
  const bids = [
    {
      letter: 'Л',
      name: 'Студия «Линия»',
      meta: '12 лет в ремонте',
      price: '470 000 ₽',
      days: '21 день',
    },
    {
      letter: 'А',
      name: 'Бригада Андрея В.',
      meta: '4 человека',
      price: '420 000 ₽',
      days: '30 дней',
    },
    {
      letter: 'О',
      name: 'Мастер Олег Т.',
      meta: 'Плитка, сантехника',
      price: '395 000 ₽',
      days: '24 дня',
      chosen: true,
    },
  ];
  return (
    <div className="absolute inset-0">
      <Canvas className="text-ink">
        <div className="landing-shadow absolute left-[24px] top-[22px] w-[460px] rounded-[22px] bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[16px] font-semibold">Ремонт ванной под ключ</p>
              <p className="text-[12px] text-ink-soft">Москва · бюджет до 450 000 ₽</p>
            </div>
            <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-canvas">
              3 отклика
            </span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {bids.map((bid, i) => (
              <li
                key={bid.name}
                className={`log-row flex items-center gap-3 rounded-2xl p-3 ${
                  bid.chosen
                    ? 'bid-chosen bg-accent-tint ring-2 ring-accent'
                    : 'bg-canvas ring-1 ring-line/70'
                }`}
                style={{ '--d': `${150 + i * 180}ms` } as React.CSSProperties}
              >
                <Avatar letter={bid.letter} tone={bid.chosen ? 'accent' : 'soft'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{bid.name}</span>
                  <span className="block text-[12px] text-ink-soft">{bid.meta}</span>
                </span>
                <span className="text-right">
                  <span className="block text-[14px] font-semibold tabular-nums">{bid.price}</span>
                  <span className="block text-[12px] tabular-nums text-ink-soft">{bid.days}</span>
                </span>
                <span
                  className={`ml-1 rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                    bid.chosen
                      ? 'bg-accent text-accent-ink'
                      : 'bg-surface text-ink ring-1 ring-line'
                  }`}
                >
                  {bid.chosen ? 'Выбран' : 'Выбрать'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="chat-pop landing-shadow absolute bottom-[14px] left-[70px] rounded-2xl bg-ink px-4 py-3 text-canvas"
          style={{ '--d': '900ms' } as React.CSSProperties}
        >
          <p className="text-[13px] font-semibold">Дешевле бюджета на 55 000 ₽</p>
          <p className="text-[12px] text-white/60">и на 6 дней быстрее среднего срока</p>
        </div>
      </Canvas>
      <Example />
    </div>
  );
}

/* ---------- 04. Материалы с доставкой ---------- */

function ProductThumb({ kind }: { kind: 'bag' | 'bucket' | 'roll' }) {
  return (
    <svg viewBox="0 0 48 48" className="size-12 shrink-0 rounded-xl bg-canvas ring-1 ring-line/70">
      {kind === 'bag' ? (
        <>
          <path d="M14 11h20l3 28H11z" fill="#c2410c" />
          <path d="M14 11h20l1 6H13z" fill="#9a3412" />
          <rect x="17" y="21" width="14" height="9" rx="1.5" fill="#fbfbfc" />
          <path d="M19 24.5h10M19 27h6" stroke="#c2410c" strokeWidth="1.2" />
        </>
      ) : kind === 'bucket' ? (
        <>
          <path d="M13 15h22l-2 22H15z" fill="#e8ecf1" stroke="#9aa4b2" strokeWidth="1.2" />
          <ellipse
            cx="24"
            cy="15"
            rx="11"
            ry="3"
            fill="#d5dbe3"
            stroke="#9aa4b2"
            strokeWidth="1.2"
          />
          <rect x="16" y="22" width="16" height="7" rx="1.5" fill="#0d1320" />
          <path d="M13 15c0-7 22-7 22 0" fill="none" stroke="#505a6b" strokeWidth="1.2" />
        </>
      ) : (
        <>
          <rect x="12" y="13" width="24" height="22" rx="3" fill="#ebe3d6" />
          <path d="M12 19h24M12 25h24M12 31h24" stroke="#d6c8b2" strokeWidth="1.2" />
          <ellipse cx="36" cy="24" rx="3" ry="11" fill="#d6c8b2" />
          <ellipse cx="36" cy="24" rx="1.2" ry="4" fill="#a8977c" />
        </>
      )}
    </svg>
  );
}

export function MaterialsScene() {
  const reduce = usePrefersReducedMotion();
  const route = 'M26 96 C 70 96, 78 40, 128 46 S 184 84, 214 36';
  const items = [
    { kind: 'bag' as const, name: 'Плиточный клей, 25 кг', qty: '× 12', price: '7 080 ₽' },
    { kind: 'bucket' as const, name: 'Грунтовка, 10 л', qty: '× 2', price: '2 340 ₽' },
    { kind: 'roll' as const, name: 'Гидроизоляция, лента', qty: '× 3', price: '1 650 ₽' },
  ];
  return (
    <div className="absolute inset-0">
      <Canvas className="text-ink">
        <div className="landing-shadow absolute left-[6px] top-[30px] w-[300px] rounded-[22px] bg-surface p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
            Материалы для этапа «Плитка»
          </p>
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li key={item.name} className="flex items-center gap-3">
                <ProductThumb kind={item.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{item.name}</span>
                  <span className="block text-[12px] text-ink-soft">{item.qty}</span>
                </span>
                <span className="text-[13px] font-semibold tabular-nums">{item.price}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
            <span className="text-[13px] text-ink-soft">Итого</span>
            <span className="text-[16px] font-semibold tabular-nums">11 070 ₽</span>
          </div>
          <span className="mt-3 block rounded-xl bg-ink py-2.5 text-center text-[13px] font-semibold text-canvas">
            Заказать доставку
          </span>
        </div>

        <div className="landing-shadow absolute right-0 top-[190px] w-[214px] overflow-hidden rounded-[20px] bg-surface">
          <svg viewBox="0 0 240 130" className="block w-full bg-[#eef1f4]">
            <path d="M0 30h240M0 80h240M60 0v130M150 0v130" stroke="#e1e5ea" strokeWidth="10" />
            <path d={route} fill="none" stroke="#d3d8de" strokeWidth="6" strokeLinecap="round" />
            <path
              className="route-draw"
              d={route}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeDasharray="5 7"
              strokeLinecap="round"
            />
            <rect x="12" y="84" width="26" height="24" rx="6" fill="var(--ink)" />
            <path
              d="M208 36 218 26l10 10v12h-20z"
              fill="#fbfbfc"
              stroke="var(--ink)"
              strokeWidth="2"
            />
            <circle
              r="6"
              fill="var(--accent)"
              stroke="#fbfbfc"
              strokeWidth="3"
              cx={reduce ? 128 : undefined}
              cy={reduce ? 46 : undefined}
            >
              {reduce ? null : <animateMotion dur="4.5s" repeatCount="indefinite" path={route} />}
            </circle>
          </svg>
          <div className="p-3.5">
            <p className="text-[13px] font-semibold">Доставка на объект</p>
            <p className="text-[12px] text-ink-soft">Завтра, 10:00–14:00 · подъём на этаж</p>
          </div>
        </div>
      </Canvas>
      <Example />
    </div>
  );
}

/* ---------- 05. Чат и фото-отчёты ---------- */

function StagePhoto({ kind, className }: { kind: 'tile' | 'floor' | 'wall'; className: string }) {
  return (
    <svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" className={className}>
      <defs>
        <linearGradient id={`light-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {kind === 'tile' ? (
        <>
          <rect width="120" height="90" fill="#e9eef1" />
          <path d="M0 0h70v90H0z" fill="#dfe6ea" />
          <path
            d="M0 15h70M0 30h70M0 45h70M0 60h70M0 75h70M14 0v90M28 0v90M42 0v90M56 0v90"
            stroke="#c4cfd6"
            strokeWidth="1"
          />
          <path d="M70 0 120 12v78H70z" fill="#d2dbe1" />
          <path
            d="M70 18 120 28M70 36 120 44M70 54 120 60M70 72 120 76M86 4v86M102 8v82"
            stroke="#bccad2"
            strokeWidth="1"
          />
          <rect x="20" y="62" width="34" height="28" rx="3" fill="#fbfbfc" />
        </>
      ) : kind === 'floor' ? (
        <>
          <rect width="120" height="90" fill="#d7d3cc" />
          <path d="M0 0h120v34H0z" fill="#e7e3dc" />
          <path d="M0 34h120v56H0z" fill="#bdb6ab" />
          <path
            d="M10 70c14-8 30-8 44 0M50 82c14-8 30-8 44 0M70 56c12-6 26-6 38 0"
            stroke="#a9a295"
            strokeWidth="1.4"
            fill="none"
          />
          <rect x="72" y="40" width="34" height="6" rx="2" fill="#e0a43a" />
          <rect x="86" y="41.5" width="6" height="3" rx="1" fill="#7cc1a0" />
        </>
      ) : (
        <>
          <rect width="120" height="90" fill="#e6e9ee" />
          <path d="M0 0h58v72H0z" fill="#f1ede6" />
          <path d="M58 0h62v72H58z" fill="#dfd8cd" />
          <rect
            x="72"
            y="12"
            width="32"
            height="34"
            rx="2"
            fill="#cfe0ee"
            stroke="#fbfbfc"
            strokeWidth="3"
          />
          <path d="M0 72h120v18H0z" fill="#c8a77e" />
          <path d="M0 78h120M0 84h120" stroke="#b8956a" strokeWidth="0.8" />
        </>
      )}
      <rect width="120" height="90" fill={`url(#light-${kind})`} />
    </svg>
  );
}

export function ChatScene() {
  return (
    <div className="absolute inset-0">
      <Canvas className="text-ink">
        <div className="landing-shadow absolute left-1/2 top-[12px] w-[360px] -translate-x-1/2 overflow-hidden rounded-[24px] bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Avatar letter="О" tone="accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">Олег Т., мастер</span>
              <span className="block text-[12px] text-ink-soft">Ремонт ванной · этап 2</span>
            </span>
            <span className="size-2 rounded-full bg-ok" />
          </div>
          <div className="space-y-2.5 bg-canvas px-4 py-4">
            <div
              className="chat-pop max-w-[80%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-[13px] leading-snug ring-1 ring-line/70"
              style={{ '--d': '150ms' } as React.CSSProperties}
            >
              Плитка в ванной уложена, фото этапа ниже
              <span className="ml-2 text-[11px] text-ink-soft">18:42</span>
            </div>
            <div
              className="chat-pop grid w-[80%] grid-cols-[2fr_1fr] grid-rows-2 gap-1.5"
              style={{ '--d': '450ms' } as React.CSSProperties}
            >
              <StagePhoto kind="tile" className="row-span-2 h-full w-full rounded-l-2xl" />
              <StagePhoto kind="floor" className="h-[58px] w-full rounded-tr-2xl" />
              <StagePhoto kind="wall" className="h-[58px] w-full rounded-br-2xl" />
            </div>
            <div
              className="chat-pop ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-[13px] leading-snug text-canvas"
              style={{ '--d': '800ms' } as React.CSSProperties}
            >
              Отлично, принимаю этап
              <span className="ml-2 text-[11px] text-white/55">18:50</span>
            </div>
            <p
              className="chat-pop mx-auto flex w-fit items-center gap-1.5 rounded-full bg-ok-tint px-3 py-1 text-[11px] font-semibold text-ok"
              style={{ '--d': '1100ms' } as React.CSSProperties}
            >
              <Check className="size-3" /> Этап «Плитка» принят
            </p>
          </div>
          <div className="flex items-center gap-2 border-t border-line px-4 py-3">
            <span className="flex-1 rounded-full bg-canvas px-3.5 py-2 text-[12px] text-ink-soft ring-1 ring-line/70">
              Сообщение
            </span>
            <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-ink">
              <svg
                viewBox="0 0 16 16"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </Canvas>
      <Example />
    </div>
  );
}

/* ---------- 06. Приложения ---------- */

function Phone({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`absolute h-[372px] w-[184px] rounded-[38px] bg-[#0d1320] p-[7px] shadow-[0_40px_60px_-24px_rgb(13_19_32/0.5),inset_0_0_0_1.5px_rgb(255_255_255/0.08)] ${className}`}
    >
      <span className="absolute -left-[2px] top-[86px] h-10 w-[3px] rounded-l bg-[#1c2536]" />
      <span className="absolute -right-[2px] top-[100px] h-14 w-[3px] rounded-r bg-[#1c2536]" />
      <div className="relative size-full overflow-hidden rounded-[31px] bg-canvas">
        <span className="absolute left-1/2 top-2 z-10 h-[18px] w-[62px] -translate-x-1/2 rounded-full bg-[#0d1320]" />
        {children}
      </div>
    </div>
  );
}

export function AppsScene() {
  const jobs = [
    { title: 'Ремонт ванной', meta: 'Москва · 450 000 ₽', hot: true },
    { title: 'Укладка ламината', meta: 'Казань · 60 000 ₽' },
    { title: 'Покраска стен', meta: 'Тверь · 35 000 ₽' },
  ];
  return (
    <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_60%_45%,rgb(194_65_12/0.10),transparent_70%)]">
      <Canvas className="text-ink">
        <Phone className="phone-back left-[24px] top-[34px]">
          <div className="px-3 pt-9">
            <p className="text-[11px] font-semibold">Олег Т., мастер</p>
            <div className="mt-3 space-y-1.5">
              <span className="block w-[80%] rounded-xl rounded-bl-sm bg-surface px-2.5 py-2 text-[10px] ring-1 ring-line/70">
                Начинаю завтра в 9:00
              </span>
              <span className="ml-auto block w-[70%] rounded-xl rounded-br-sm bg-ink px-2.5 py-2 text-[10px] text-canvas">
                Хорошо, жду
              </span>
              <span className="block h-16 w-[80%] rounded-xl bg-[linear-gradient(135deg,#dfe6ea,#c4cfd6)]" />
            </div>
          </div>
        </Phone>

        <Phone className="phone-float left-[186px] top-[14px]">
          <div className="flex h-full flex-col">
            <div className="px-3.5 pt-9">
              <p className="font-display text-[15px] font-semibold tracking-[-0.02em]">
                Мои заказы
              </p>
            </div>
            <div className="mt-3 flex-1 space-y-2 px-2.5">
              {jobs.map((job) => (
                <div key={job.title} className="rounded-2xl bg-surface p-2.5 ring-1 ring-line/70">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold">{job.title}</span>
                    {job.hot ? (
                      <span className="rounded-full bg-accent px-1.5 text-[9px] font-semibold leading-4 text-accent-ink">
                        3
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-0.5 block text-[10px] text-ink-soft">{job.meta}</span>
                </div>
              ))}
              <span className="block rounded-xl bg-ink py-2 text-center text-[11px] font-semibold text-canvas">
                Новый заказ
              </span>
            </div>
            <div className="flex justify-around border-t border-line bg-surface px-2 pb-4 pt-2.5">
              {['bg-accent', 'bg-[#c9ced6]', 'bg-[#c9ced6]', 'bg-[#c9ced6]'].map((tone, i) => (
                <span key={i} className={`size-[18px] rounded-md ${tone}`} />
              ))}
            </div>
          </div>
        </Phone>

        <div className="absolute left-[392px] top-[150px] flex flex-col items-start gap-2">
          <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-canvas">
            Веб-версия работает
          </span>
          <span className="rounded-full bg-surface px-3 py-1.5 text-[11px] font-semibold ring-1 ring-line">
            iOS · скоро
          </span>
          <span className="rounded-full bg-surface px-3 py-1.5 text-[11px] font-semibold ring-1 ring-line">
            Android · скоро
          </span>
        </div>
      </Canvas>
    </div>
  );
}

/* ---------- 07. Модерация и защита ---------- */

export function ProtectionScene() {
  const rows: { label: string; state: string; ok: boolean }[] = [
    { label: 'Защита от перебора паролей', state: 'Работает', ok: true },
    { label: 'Ограничение частоты запросов', state: 'Работает', ok: true },
    { label: 'Данные на серверах в России', state: 'Работает', ok: true },
    { label: 'Модерация заказов и отзывов', state: 'Работает', ok: true },
  ];
  return (
    <div className="absolute inset-0">
      <Canvas className="text-ink">
        <div className="landing-shadow absolute left-[10px] top-[78px] w-[390px] rounded-[22px] bg-surface p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-ink text-canvas">
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M12 3 5 6v5.5c0 4.3 2.9 7.9 7 9.5 4.1-1.6 7-5.2 7-9.5V6z"
                  strokeLinejoin="round"
                />
                <path d="m9 12 2.2 2.2L15.5 10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>
              <span className="block text-[16px] font-semibold">Защита аккаунта</span>
              <span className="block text-[12px] text-ink-soft">
                3 из 4 механизмов уже работают
              </span>
            </span>
          </div>
          <ul className="mt-4 divide-y divide-line/80">
            {rows.map((row, i) => (
              <li
                key={row.label}
                className="log-row flex items-center justify-between gap-3 py-3"
                style={{ '--d': `${150 + i * 200}ms` } as React.CSSProperties}
              >
                <span className="flex items-center gap-2.5 text-[14px] font-medium">
                  <span
                    className={`grid size-5 place-items-center rounded-full ${
                      row.ok ? 'bg-ok-tint text-ok' : 'bg-[#eceef1] text-ink-soft'
                    }`}
                  >
                    {row.ok ? (
                      <Check className="size-3" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  {row.label}
                </span>
                <span
                  className={`text-[12px] font-semibold ${row.ok ? 'text-ok' : 'text-ink-soft'}`}
                >
                  {row.state}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="chat-pop absolute right-0 top-[14px] flex w-[230px] items-start gap-3 rounded-2xl bg-ink p-3.5 text-canvas shadow-[0_30px_50px_-20px_rgb(13_19_32/0.6)]"
          style={{ '--d': '1000ms' } as React.CSSProperties}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
            <Lock className="size-4" />
          </span>
          <span>
            <span className="block text-[13px] font-semibold">Вход временно заблокирован</span>
            <span className="block text-[12px] leading-snug text-white/60">
              Слишком много неверных паролей подряд
            </span>
          </span>
        </div>
      </Canvas>
      <Example />
    </div>
  );
}
