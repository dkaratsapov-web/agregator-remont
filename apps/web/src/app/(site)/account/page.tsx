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
import { AccountStamp } from '@/components/account/account-stamp';
import { LogoutForm } from '@/components/auth/logout-form';
import { BID_STATUS_DOTS, BidStatusBadge } from '@/components/bids/bid-status-badge';
import { jobCategoryLabels } from '@/components/jobs/job-details';
import { JOB_STATUS_DOTS, StatusBadge } from '@/components/status-badge';
import { EmptyState, PageHeader, primaryLinkClass } from '@/components/ui/page-header';
import { ProgressRuler } from '@/components/ui/progress-ruler';
import {
  Ledger,
  LedgerLink,
  Sheet,
  SheetBody,
  SheetHeader,
  SheetLink,
} from '@/components/ui/sheet';
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
  done: number;
  total: number;
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
  const done = checks.length - missing.length;
  return {
    done,
    total: checks.length,
    percent: Math.round((done / checks.length) * 100),
    missing,
  };
}

/**
 * Сводка: числа в одной таблице с тонкими линиями между ячейками, как спецификация на листе.
 * Первая ячейка — итог, остальные — по статусам.
 */
function Tally({
  items,
  note,
}: {
  items: { label: string; value: number; dot?: string }[];
  note?: string;
}) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {items.map((item, index) => (
          <div key={item.label} className="bg-surface px-5 py-4 sm:px-6">
            <dt className="flex items-center gap-2 text-sm text-ink-soft">
              {item.dot ? (
                <span aria-hidden="true" className={`size-1.5 rounded-[1px] ${item.dot}`} />
              ) : null}
              {item.label}
            </dt>
            <dd
              className={`mt-1.5 font-display font-semibold leading-none tabular-nums tracking-[-0.03em] text-ink ${
                index === 0 ? 'text-[2.4rem]' : 'text-[1.9rem]'
              }`}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {note ? (
        <p className="border-t border-line px-5 py-2.5 text-xs text-ink-soft sm:px-6">{note}</p>
      ) : null}
    </>
  );
}

function Unavailable() {
  return (
    <Sheet>
      <EmptyState title="Сводка не загрузилась">
        Сервер не ответил. Обновите страницу чуть позже: данные на месте.
      </EmptyState>
    </Sheet>
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
    <div className="flex flex-col gap-6">
      <Sheet labelledBy="summary-title">
        <SheetHeader id="summary-title" title="Сводка по заказам" />
        <Tally
          items={[
            { label: 'Всего заказов', value: jobs.total },
            ...JOB_STATUSES.map((status) => ({
              label: JOB_STATUS_LABELS[status],
              value: counts[status],
              dot: JOB_STATUS_DOTS[status],
            })),
          ]}
          note={partial ? `По статусам — из последних ${SUMMARY_LIMIT} заказов.` : undefined}
        />
      </Sheet>

      <Sheet labelledBy="recent-jobs">
        <SheetHeader
          id="recent-jobs"
          title="Последние заказы"
          action={jobs.total > 0 ? <SheetLink href="/account/jobs">Все заказы</SheetLink> : null}
        />
        {jobs.items.length === 0 ? (
          <EmptyState
            title="Заказов пока нет"
            action={
              <Link href="/account/jobs/new" className={primaryLinkClass}>
                Новый заказ
              </Link>
            }
          >
            Опишите задачу, и мастера пришлют отклики с ценой и сроком.
          </EmptyState>
        ) : (
          <Ledger>
            {jobs.items.slice(0, 5).map((job) => (
              <LedgerLink
                key={job.id}
                href={`/account/jobs/${job.id}`}
                title={job.title}
                meta={`${jobCategoryLabels(job).join(', ')} · ${job.city}`}
                aside={
                  <>
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      {formatBudget(job.budgetMin, job.budgetMax, job.currency)}
                    </span>
                    <StatusBadge status={job.status} />
                  </>
                }
              />
            ))}
          </Ledger>
        )}
      </Sheet>
    </div>
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
    <div className="flex flex-col gap-6">
      {completeness.percent < 100 ? (
        <Sheet labelledBy="profile-progress" className="border-accent/40">
          <SheetHeader
            id="profile-progress"
            title={`Профиль мастера заполнен на ${completeness.percent}%`}
            description={`Заказчики видят профиль рядом с вашим откликом. Не хватает: ${completeness.missing.join(', ')}.`}
            action={
              <Link href="/account/profile" className={primaryLinkClass}>
                Заполнить
              </Link>
            }
          />
          <SheetBody className="!py-4">
            <ProgressRuler
              answered={completeness.done}
              total={completeness.total}
              label="Заполнение профиля мастера"
            />
          </SheetBody>
        </Sheet>
      ) : null}

      <Sheet labelledBy="summary-title">
        <SheetHeader id="summary-title" title="Сводка по откликам" />
        <Tally
          items={[
            { label: 'Всего откликов', value: bids.total },
            ...(['PENDING', 'ACCEPTED', 'REJECTED'] as const).map((status) => ({
              label: BID_STATUS_LABELS[status],
              value: counts[status],
              dot: BID_STATUS_DOTS[status],
            })),
          ]}
          note={partial ? `По статусам — из последних ${SUMMARY_LIMIT} откликов.` : undefined}
        />
      </Sheet>

      <Sheet labelledBy="recent-bids">
        <SheetHeader
          id="recent-bids"
          title="Последние отклики"
          action={bids.total > 0 ? <SheetLink href="/account/bids">Все отклики</SheetLink> : null}
        />
        {bids.items.length === 0 ? (
          <EmptyState
            title="Откликов пока нет"
            action={
              <Link href="/jobs?open=1" className={primaryLinkClass}>
                Найти заказ
              </Link>
            }
          >
            Найдите заказ в каталоге и предложите свою цену и срок.
          </EmptyState>
        ) : (
          <Ledger>
            {bids.items.slice(0, 5).map((bid) => (
              <LedgerLink
                key={bid.id}
                href={`/jobs/${bid.job.id}`}
                title={bid.job.title}
                meta={bid.job.city}
                aside={
                  <>
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      {formatAmount(bid.price)} ₽
                    </span>
                    <BidStatusBadge status={bid.status} />
                  </>
                }
              />
            ))}
          </Ledger>
        )}
      </Sheet>
    </div>
  );
}

type NavItem = { href: string; title: string; text: string };

const NAV: Record<'CUSTOMER' | 'CONTRACTOR' | 'ADMIN', NavItem[]> = {
  CUSTOMER: [
    { href: '/account/jobs', title: 'Мои заказы', text: 'Черновики, отклики, закрытие' },
    { href: '/jobs', title: 'Каталог', text: 'Заказы других заказчиков' },
    { href: '/account/settings', title: 'Настройки', text: 'Профиль, пароль, входы' },
  ],
  CONTRACTOR: [
    { href: '/account/bids', title: 'Мои отклики', text: 'Статусы и история' },
    { href: '/account/profile', title: 'Профиль мастера', text: 'Опыт, категории и города' },
    { href: '/account/settings', title: 'Настройки', text: 'Профиль, пароль, входы' },
  ],
  ADMIN: [
    { href: '/jobs', title: 'Каталог', text: 'Все опубликованные заказы' },
    { href: '/account/settings', title: 'Настройки', text: 'Профиль, пароль, входы' },
  ],
};

const PRIMARY: Record<'CUSTOMER' | 'CONTRACTOR' | 'ADMIN', { href: string; label: string }> = {
  CUSTOMER: { href: '/account/jobs/new', label: 'Новый заказ' },
  CONTRACTOR: { href: '/jobs?open=1', label: 'Найти заказ' },
  ADMIN: { href: '/admin/leads', label: 'Заявки на тестирование' },
};

export default async function AccountPage() {
  const [user, token] = await Promise.all([getCurrentUser(), getSessionToken()]);
  if (!user || !token) redirect('/login?next=/account');

  const primary = PRIMARY[user.role];

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        title={`Здравствуйте, ${user.name}`}
        description={
          user.role === 'CONTRACTOR'
            ? 'Отклики, профиль мастера и настройки — всё здесь.'
            : user.role === 'ADMIN'
              ? 'Аккаунт администратора: заявки на закрытое тестирование и каталог заказов.'
              : 'Заказы, черновики и отклики мастеров — всё здесь.'
        }
        action={
          <Link href={primary.href} className={primaryLinkClass}>
            {primary.label}
          </Link>
        }
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {user.role === 'ADMIN' ? (
            <Sheet>
              <EmptyState title="Сводки для администратора нет">
                Заявки на закрытое тестирование — по кнопке выше, заказы — в каталоге.
              </EmptyState>
            </Sheet>
          ) : user.role === 'CONTRACTOR' ? (
            <ContractorSummary token={token} />
          ) : (
            <CustomerSummary token={token} />
          )}
        </div>

        <aside aria-label="Аккаунт и разделы" className="flex flex-col gap-6 lg:sticky lg:top-24">
          <AccountStamp user={user} />

          <Sheet labelledBy="sections-title">
            <SheetHeader id="sections-title" title="Разделы" />
            <Ledger>
              {NAV[user.role].map((item) => (
                <LedgerLink key={item.href} href={item.href} title={item.title} meta={item.text} />
              ))}
            </Ledger>
            <div className="border-t border-line px-3 py-2">
              <LogoutForm />
            </div>
          </Sheet>
        </aside>
      </div>
    </div>
  );
}
