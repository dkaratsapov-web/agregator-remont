import { JOB_CATEGORIES, JOB_CATEGORY_LABELS } from '@agregator/shared';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { JobCard } from '@/components/job-card';
import { getJobs } from '@/lib/api';
import { formatBudget } from '@/lib/format';
import { jobsHref } from '@/lib/search-params';

export const dynamic = 'force-dynamic';

async function loadLatest() {
  try {
    return await getJobs({ page: 1, limit: 6 });
  } catch (error) {
    console.error('Home: failed to load jobs', error);
    return null;
  }
}

const primaryCta =
  'inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-6 text-base font-semibold text-accent-ink transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.97]';

export default async function HomePage() {
  const latest = await loadLatest();
  const featured = latest?.items.slice(0, 3) ?? [];

  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
        <div>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-5xl lg:text-6xl">
            Заказы на ремонт с понятным бюджетом
          </h1>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-ink-soft">
            Заказчики описывают работы, город и сумму. Подрядчики выбирают подходящие заказы без
            лишних звонков.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/jobs" className={primaryCta}>
              Смотреть заказы
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-6 text-base font-medium text-ink transition-colors duration-150 hover:border-ink-soft/50"
            >
              Как это работает
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-sunken p-2">
          <div className="rounded-[18px] border border-line bg-surface p-5 shadow-raised">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">Свежие заказы</h2>
              {latest ? (
                <span className="text-sm tabular-nums text-ink-soft">всего {latest.total}</span>
              ) : null}
            </div>
            {latest === null ? (
              <p className="mt-4 text-sm text-ink-soft">
                Список заказов сейчас недоступен. Попробуйте обновить страницу.
              </p>
            ) : featured.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">
                Заказов пока нет. Новые появятся здесь сразу после публикации.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {featured.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="-mx-2 flex flex-col gap-1 rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-muted-tint"
                    >
                      <span className="font-medium leading-snug">{job.title}</span>
                      <span className="flex flex-wrap justify-between gap-x-3 text-sm text-ink-soft">
                        <span>{job.city}</span>
                        <span className="font-semibold tabular-nums text-ink">
                          {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="categories" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="categories" className="text-2xl font-semibold tracking-tight">
          Категории работ
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {JOB_CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                href={jobsHref({ category })}
                className="flex min-h-14 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium transition-colors duration-150 hover:border-accent hover:text-accent"
              >
                {JOB_CATEGORY_LABELS[category]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="how-title"
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
      >
        <h2 id="how-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
          Как это работает
        </h2>
        <div className="mt-8 grid gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <h3 className="text-lg font-semibold">Заказчику</h3>
            <ol className="mt-4 list-decimal space-y-3 pl-5 leading-relaxed text-ink-soft marker:font-semibold marker:text-accent">
              <li>Опишите работы, укажите город и бюджет.</li>
              <li>Получите отклики подрядчиков и сравните условия.</li>
              <li>Выберите исполнителя и договоритесь о сроках.</li>
            </ol>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Подрядчику</h3>
            <ol className="mt-4 list-decimal space-y-3 pl-5 leading-relaxed text-ink-soft marker:font-semibold marker:text-accent">
              <li>Отфильтруйте заказы по категории работ.</li>
              <li>Изучите описание и бюджет до первого звонка.</li>
              <li>Откликнитесь на подходящий заказ.</li>
            </ol>
          </div>
        </div>
        <p className="mt-10 max-w-2xl rounded-xl bg-accent-tint px-5 py-4 text-sm leading-relaxed text-ink">
          Сейчас работает публичный каталог. Регистрация, публикация заказов и отклики появятся в
          следующем обновлении.
        </p>
      </section>

      {latest && latest.items.length > 3 ? (
        <section aria-labelledby="more-jobs" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="more-jobs" className="text-2xl font-semibold tracking-tight">
              Ещё заказы
            </h2>
            <Link href="/jobs" className="text-sm font-semibold text-accent hover:underline">
              Весь каталог
            </Link>
          </div>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {latest.items.slice(3).map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        </section>
      ) : latest === null ? (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <ApiUnavailable />
        </section>
      ) : null}
    </>
  );
}
