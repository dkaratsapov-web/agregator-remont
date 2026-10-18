import {
  BID_STATUSES,
  BID_STATUS_LABELS,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  type ContractorProfileDto,
  type MyBidDto,
  type OwnJobDto,
  type Paginated,
} from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProfileCard } from '@/components/account/profile-card';
import { LogoutForm } from '@/components/auth/logout-form';
import { BidStatusBadge } from '@/components/bids/bid-status-badge';
import { StatusBadge } from '@/components/status-badge';
import { getMyProfile, listMyBids, listMyJobs } from '@/lib/api';
import { formatAmount, formatBudget } from '@/lib/format';
import { getCurrentUser, getSessionToken } from '@/lib/session';

export const metadata: Metadata = { title: 'Личный кабинет', robots: { index: false } };

/** Сколько последних записей берём для сводки (максимум API). */
const SUMMARY_LIMIT = 50;

function countBy<T extends string>(keys: readonly T[], values: T[]): Record<T, number> {
  const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const value of values) result[value] += 1;
  return result;
}

/** Заполненность профиля подрядчика: четыре поля, которые видит заказчик. */
function profileCompleteness(profile: ContractorProfileDto): {
  percent: number;
  missing: string[];
} {
  const checks: [boolean, string][] = [
    [profile.about.trim().length > 0, 'о себе'],
    [profile.categories.length > 0, 'категории работ'],
    [profile.cities.length > 0, 'города'],
    [profile.experienceYears !== null, 'опыт'],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  return { percent: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[20px] border border-line/80 bg-surface p-5">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="font-display mt-2 text-3xl font-semibold tabular-nums tracking-[-0.03em]">
        {value}
      </dd>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

function ActionCard({
  href,
  title,
  text,
  primary = false,
}: {
  href: string;
  title: string;
  text: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between gap-6 rounded-[22px] p-5 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 ${
        primary
          ? 'bg-ink text-canvas shadow-[0_24px_48px_-28px_hsl(var(--shadow-color)/0.7)]'
          : 'border border-line/80 bg-surface hover:shadow-[0_18px_40px_-22px_hsl(var(--shadow-color)/0.35)]'
      }`}
    >
      <div>
        <p className="text-base font-semibold">{title}</p>
        <p className={`mt-1 text-sm ${primary ? 'text-canvas/65' : 'text-ink-soft'}`}>{text}</p>
      </div>
      <span
        aria-hidden="true"
        className={`grid size-9 place-items-center self-end rounded-full transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
          primary ? 'bg-accent text-white' : 'bg-canvas text-ink'
        }`}
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
    </Link>
  );
}

function Unavailable() {
  return (
    <p className="rounded-[20px] border border-dashed border-line bg-surface p-5 text-sm text-ink-soft">
      Не удалось загрузить сводку. Обновите страницу чуть позже.
    </p>
  );
}

async function CustomerSummary({ token }: { token: string }) {
  let jobs: Paginated<OwnJobDto> | null = null;
  try {
    jobs = await listMyJobs(token, 1, SUMMARY_LIMIT);
  } catch (error) {
    console.error('Account: failed to load jobs', error);
  }
  if (!jobs) return <Unavailable />;

  const counts = countBy(
    JOB_STATUSES,
    jobs.items.map((job) => job.status),
  );
  const partial = jobs.total > jobs.items.length;

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Всего заказов" value={jobs.total} />
        {JOB_STATUSES.map((status) => (
          <Stat
            key={status}
            label={JOB_STATUS_LABELS[status]}
            value={counts[status]}
            hint={partial ? `из последних ${SUMMARY_LIMIT}` : undefined}
          />
        ))}
      </dl>

      <section aria-labelledby="recent-jobs" className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <h2 id="recent-jobs" className="text-lg font-semibold">
            Последние заказы
          </h2>
          {jobs.total > 0 ? (
            <Link
              href="/account/jobs"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Все заказы
            </Link>
          ) : null}
        </div>
        {jobs.items.length === 0 ? (
          <p className="mt-4 rounded-[20px] border border-dashed border-line bg-surface p-6 text-ink-soft">
            Заказов пока нет. Опишите задачу, и мастера пришлют отклики с ценой и сроком.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line/80 overflow-hidden rounded-[20px] border border-line/80 bg-surface">
            {jobs.items.slice(0, 4).map((job) => (
              <li key={job.id}>
                <Link
                  href={`/account/jobs/${job.id}`}
                  className="flex flex-col gap-2 p-4 transition-colors hover:bg-canvas sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{job.title}</span>
                    <span className="mt-0.5 block text-sm text-ink-soft">
                      {job.city} · {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
                    </span>
                  </span>
                  <StatusBadge status={job.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

async function ContractorSummary({ token }: { token: string }) {
  let bids: Paginated<MyBidDto> | null = null;
  let profile: ContractorProfileDto | null = null;
  try {
    [bids, profile] = await Promise.all([
      listMyBids(token, 1, { limit: SUMMARY_LIMIT }),
      getMyProfile(token),
    ]);
  } catch (error) {
    console.error('Account: failed to load bids or profile', error);
  }
  if (!bids || !profile) return <Unavailable />;

  const counts = countBy(
    BID_STATUSES,
    bids.items.map((bid) => bid.status),
  );
  const partial = bids.total > bids.items.length;
  const completeness = profileCompleteness(profile);

  return (
    <>
      {completeness.percent < 100 ? (
        <div className="mb-6 rounded-[22px] border border-accent/25 bg-accent-tint p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">Профиль заполнен на {completeness.percent}%</p>
            <Link
              href="/account/profile"
              className="inline-flex min-h-10 items-center rounded-full bg-ink px-4 text-sm font-semibold text-canvas hover:bg-ink/85"
            >
              Заполнить
            </Link>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${completeness.percent}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            Заказчики видят профиль рядом с вашим откликом. Не хватает:{' '}
            {completeness.missing.join(', ')}.
          </p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Всего откликов" value={bids.total} />
        {(['PENDING', 'ACCEPTED', 'REJECTED'] as const).map((status) => (
          <Stat
            key={status}
            label={BID_STATUS_LABELS[status]}
            value={counts[status]}
            hint={partial ? `из последних ${SUMMARY_LIMIT}` : undefined}
          />
        ))}
      </dl>

      <section aria-labelledby="recent-bids" className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <h2 id="recent-bids" className="text-lg font-semibold">
            Последние отклики
          </h2>
          {bids.total > 0 ? (
            <Link
              href="/account/bids"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Все отклики
            </Link>
          ) : null}
        </div>
        {bids.items.length === 0 ? (
          <p className="mt-4 rounded-[20px] border border-dashed border-line bg-surface p-6 text-ink-soft">
            Откликов пока нет. Найдите заказ в каталоге и предложите свою цену и срок.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line/80 overflow-hidden rounded-[20px] border border-line/80 bg-surface">
            {bids.items.slice(0, 4).map((bid) => (
              <li key={bid.id}>
                <Link
                  href={`/jobs/${bid.job.id}`}
                  className="flex flex-col gap-2 p-4 transition-colors hover:bg-canvas sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{bid.job.title}</span>
                    <span className="mt-0.5 block text-sm text-ink-soft">
                      {bid.job.city} ·{' '}
                      <span className="tabular-nums">{formatAmount(bid.price)} ₽</span>
                    </span>
                  </span>
                  <BidStatusBadge status={bid.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default async function AccountPage() {
  const [user, token] = await Promise.all([getCurrentUser(), getSessionToken()]);
  if (!user || !token) redirect('/login?next=/account');

  const isContractor = user.role === 'CONTRACTOR';
  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-10 sm:px-6 lg:px-10 md:pt-14">
      <ProfileCard user={user} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {isAdmin ? (
            <p className="rounded-[20px] border border-line/80 bg-surface p-5 text-ink-soft">
              Аккаунт администратора: заявки на закрытое тестирование и каталог заказов.
            </p>
          ) : isContractor ? (
            <ContractorSummary token={token} />
          ) : (
            <CustomerSummary token={token} />
          )}
        </div>

        <aside className="flex flex-col gap-3">
          {isAdmin ? (
            <>
              <ActionCard
                primary
                href="/admin/leads"
                title="Заявки"
                text="Заявки на закрытое тестирование"
              />
              <ActionCard href="/jobs" title="Каталог" text="Все опубликованные заказы" />
            </>
          ) : isContractor ? (
            <>
              <ActionCard
                primary
                href="/jobs?open=1"
                title="Найти заказ"
                text="Открытые заказы в каталоге"
              />
              <ActionCard href="/account/bids" title="Мои отклики" text="Статусы и история" />
              <ActionCard href="/account/profile" title="Профиль" text="Опыт, категории и города" />
            </>
          ) : (
            <>
              <ActionCard
                primary
                href="/account/jobs/new"
                title="Новый заказ"
                text="Задача, город и бюджет"
              />
              <ActionCard
                href="/account/jobs"
                title="Мои заказы"
                text="Отклики, правки, закрытие"
              />
              <ActionCard href="/jobs" title="Каталог" text="Заказы других заказчиков" />
            </>
          )}

          <div className="mt-3 rounded-[22px] border border-line/80 bg-surface p-5">
            <dl className="text-sm">
              <dt className="text-ink-soft">ID аккаунта</dt>
              <dd className="mt-0.5 break-all font-mono text-xs">{user.id}</dd>
            </dl>
            <div className="mt-4 border-t border-line pt-4">
              <LogoutForm />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
