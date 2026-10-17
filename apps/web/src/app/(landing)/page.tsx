import { JOB_CATEGORY_LABELS } from '@agregator/shared';
import { Features } from '@/components/landing/features';
import { LandingHeader } from '@/components/landing/landing-header';
import { Manifesto } from '@/components/landing/manifesto';
import { Preloader } from '@/components/landing/preloader';
import { Reveal } from '@/components/landing/reveal';
import { PrimaryCta, Story } from '@/components/landing/story';
import { ViewerProvider } from '@/components/landing/viewer';
import { Wordmark } from '@/components/landing/wordmark';
import { getCurrentUser } from '@/lib/session';

const CATEGORIES = Object.values(JOB_CATEGORY_LABELS).filter((label) => label !== 'Другое');

export default async function LandingPage() {
  // Запрос к API только при cookie сессии: гость получает страницу без обращения к API.
  const user = await getCurrentUser();
  return (
    <ViewerProvider viewer={user ? { name: user.name } : null}>
      <Preloader />
      <span id="top" aria-hidden="true" className="absolute top-0" />
      <LandingHeader />
      <main id="main">
        <Story />

        <Features />

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
    </ViewerProvider>
  );
}
