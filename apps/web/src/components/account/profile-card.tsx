import { USER_ROLE_LABELS, type UserDto } from '@agregator/shared';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { CopyId } from './copy-id';
import { UserAvatar } from './user-avatar';

const formatPhone = (phone: string) =>
  phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 $1 $2-$3-$4');

/** Карточка профиля в кабинете: главное о пользователе и насколько заполнен профиль. */
export function ProfileCard({ user }: { user: UserDto }) {
  const checklist = [
    { done: user.avatarVersion !== null, label: 'Фото профиля' },
    { done: user.phone !== null, label: 'Телефон' },
    { done: user.city !== null, label: 'Город' },
  ];
  const filled = 1 + checklist.filter((item) => item.done).length;
  const percent = Math.round((filled / (checklist.length + 1)) * 100);

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: 'Email', value: <span className="break-all">{user.email}</span> },
    { label: 'Телефон', value: user.phone ? formatPhone(user.phone) : 'Не указан' },
    { label: 'Город', value: user.city ?? 'Не указан' },
    {
      label: 'На площадке с',
      value: <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>,
    },
  ];

  return (
    <section
      aria-labelledby="profile-card-title"
      className="relative overflow-hidden rounded-[28px] border border-line/80 bg-surface p-5 shadow-[0_1px_1px_hsl(var(--shadow-color)/0.05),0_18px_40px_-24px_hsl(var(--shadow-color)/0.35)] sm:p-7"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,var(--accent-tint),transparent)]"
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
          <UserAvatar
            name={user.name}
            avatarVersion={user.avatarVersion}
            className="size-20 text-2xl ring-4 ring-surface sm:size-24 sm:text-3xl"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Личный кабинет · {USER_ROLE_LABELS[user.role]}
            </p>
            <h1
              id="profile-card-title"
              className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-tight [overflow-wrap:break-word] sm:text-2xl md:text-[2.2rem]"
            >
              Здравствуйте, {user.name}
            </h1>
            <div className="mt-3">
              <CopyId publicId={user.publicId} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/account/settings#profile"
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas transition-[background-color,transform] duration-200 hover:bg-ink/85 active:scale-[0.97]"
          >
            Редактировать профиль
          </Link>
          <Link
            href="/account/settings#appearance"
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink transition-colors duration-200 hover:border-ink-soft/50"
          >
            Оформление
          </Link>
        </div>
      </div>

      <div className="relative mt-7 grid gap-6 border-t border-line pt-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-ink-soft">{fact.label}</dt>
              <dd className="mt-0.5 font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-2xl bg-canvas p-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">Профиль заполнен</span>
            <span className="font-semibold tabular-nums text-accent">{percent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted-tint">
            <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`grid size-4 place-items-center rounded-full text-[10px] ${
                    item.done ? 'bg-ok text-canvas' : 'border border-line'
                  }`}
                >
                  {item.done ? '✓' : ''}
                </span>
                <span className={item.done ? 'text-ink-soft line-through' : 'text-ink'}>
                  {item.label}
                </span>
                <span className="sr-only">{item.done ? 'заполнено' : 'не заполнено'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
