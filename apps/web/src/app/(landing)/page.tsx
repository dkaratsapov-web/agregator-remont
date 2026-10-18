import { PRIVACY_OPERATOR } from '@agregator/shared';
import { Features } from '@/components/landing/features';
import { LeadForm } from '@/components/landing/lead-form';
import { LandingHeader } from '@/components/landing/landing-header';
import { Manifesto } from '@/components/landing/manifesto';
import { Preloader } from '@/components/landing/preloader';
import { ScrollReset } from '@/components/landing/scroll-reset';
import { Reveal } from '@/components/landing/reveal';
import { Story } from '@/components/landing/story';
import { ViewerProvider } from '@/components/landing/viewer';
import { Wordmark } from '@/components/landing/wordmark';
import { getAvatarThumb } from '@/lib/avatar-thumb';
import { getCurrentUser } from '@/lib/session';

const SERVICE_ROWS = [
  [
    'Ремонт квартир под ключ',
    'Косметический ремонт',
    'Ремонт ванной',
    'Ремонт кухни',
    'Сантехника',
    'Электромонтаж',
    'Укладка плитки',
    'Штукатурка стен',
    'Шпаклёвка и покраска',
    'Поклейка обоев',
  ],
  [
    'Натяжные потолки',
    'Потолки из гипсокартона',
    'Стяжка пола',
    'Укладка ламината',
    'Паркетная доска',
    'Наливные полы',
    'Тёплый пол',
    'Демонтаж',
    'Перепланировка',
    'Монтаж перегородок',
  ],
  [
    'Установка дверей',
    'Замена окон',
    'Остекление балкона',
    'Утепление балкона',
    'Монтаж кондиционеров',
    'Отопление и радиаторы',
    'Вентиляция',
    'Сборка кухни',
    'Мастер на час',
    'Уборка после ремонта',
  ],
];

export default async function LandingPage() {
  // Запрос к API только при cookie сессии: гость получает страницу без обращения к API.
  const user = await getCurrentUser();
  const avatarSrc = user?.avatarVersion ? await getAvatarThumb() : null;
  return (
    <ViewerProvider
      viewer={
        user
          ? {
              name: user.name,
              role: user.role,
              publicId: user.publicId,
              // Фото не грузится отдельным запросом из закрытой части (/account/avatar): если браузер
              // ещё не знает пароль тестировщика, это вызвало бы окно ввода пароля. Мини-фото
              // встроено в страницу; без него — первая буква имени.
              avatarVersion: avatarSrc ? user.avatarVersion : null,
              avatarSrc,
            }
          : null
      }
    >
      <ScrollReset />
      <Preloader />
      <span id="top" aria-hidden="true" className="absolute top-0" />
      <LandingHeader />
      <main id="main">
        <Story />

        <Features />

        {/* Виды работ: три бегущие строки в разные стороны, услуги не повторяются */}
        <section aria-labelledby="services-title" className="border-y border-line bg-surface py-10">
          <h2 id="services-title" className="sr-only">
            Виды работ
          </h2>
          <div className="flex flex-col gap-5 sm:gap-6">
            {SERVICE_ROWS.map((row, r) => (
              <div key={r} className="marquee overflow-hidden">
                <div
                  className={`marquee-track ${r === 1 ? 'marquee-track--reverse' : ''}`}
                  style={{ '--marquee-duration': `${52 + r * 9}s` } as React.CSSProperties}
                >
                  {[0, 1].map((copy) => (
                    <ul
                      key={copy}
                      aria-hidden={copy === 1 ? true : undefined}
                      className="flex shrink-0 items-center"
                    >
                      {row.map((label) => (
                        <li
                          key={label}
                          className={`font-display flex items-center whitespace-nowrap text-lg font-medium tracking-[-0.02em] sm:text-2xl ${
                            r === 1 ? 'text-ink-soft' : 'text-ink'
                          }`}
                        >
                          <span className="px-4 sm:px-6">{label}</span>
                          <span
                            aria-hidden="true"
                            className={`size-1.5 rotate-45 rounded-[1px] ${r === 1 ? 'bg-ink-soft/50' : 'bg-accent'}`}
                          />
                        </li>
                      ))}
                    </ul>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* О сервисе */}
        <section id="about" className="mx-auto max-w-[1600px] px-4 py-28 sm:px-6 lg:px-10 lg:py-40">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">О сервисе</p>
          <div className="mt-6">
            <Manifesto text="Мы делаем Гарантыч, чтобы цена и срок ремонта были известны до начала работ, а деньги переходили мастеру только после того, как вы приняли этап." />
          </div>
        </section>

        {/* Заявка на закрытое тестирование */}
        <section id="apply" className="mx-auto max-w-[1600px] px-4 pb-24 sm:px-6 lg:px-10">
          <Reveal>
            <div className="iso-grid landing-shadow-lg relative grid gap-10 overflow-hidden rounded-[28px] border border-line/70 bg-surface px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:px-16">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-[radial-gradient(closest-side,rgb(194_65_12/0.14),transparent)]"
              />
              <div className="relative">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                  Закрытое тестирование
                </p>
                <h2 className="font-display mt-4 text-3xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl">
                  Оставить заявку на участие в закрытом тестировании
                </h2>
                <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
                  Оставьте имя и телефон: свяжемся, когда откроем доступ для новых заказчиков и
                  мастеров.
                </p>
              </div>
              <div className="relative self-center">
                <LeadForm open={PRIVACY_OPERATOR !== null} />
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
          <Wordmark />
          <p className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <span>Площадка заказов на ремонт и строительство. Закрытое тестирование, 2026.</span>
            <a
              href="/privacy"
              className="underline decoration-line underline-offset-4 hover:text-ink hover:decoration-accent"
            >
              Политика конфиденциальности
            </a>
          </p>
        </div>
      </footer>
    </ViewerProvider>
  );
}
