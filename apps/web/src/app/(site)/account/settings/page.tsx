import { USER_ROLE_LABELS, type SessionDto } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppearanceForm } from '@/components/account/appearance-form';
import { AvatarUploader } from '@/components/account/avatar-uploader';
import { PasswordForm } from '@/components/account/password-form';
import { ProfileForm } from '@/components/account/profile-form';
import { SessionsList } from '@/components/account/sessions-list';
import { listSessions } from '@/lib/api';
import { getCurrentUser, getSessionToken } from '@/lib/session';

export const metadata: Metadata = { title: 'Настройки', robots: { index: false } };

const SECTIONS = [
  { id: 'profile', title: 'Профиль' },
  { id: 'appearance', title: 'Оформление' },
  { id: 'security', title: 'Пароль' },
  { id: 'devices', title: 'Устройства' },
];

function Section({
  id,
  title,
  text,
  children,
}: {
  id: string;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 rounded-[24px] border border-line/80 bg-surface p-5 sm:p-7"
    >
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{text}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const [user, token] = await Promise.all([getCurrentUser(), getSessionToken()]);
  if (!user || !token) redirect('/login?next=/account/settings');

  let sessions: SessionDto[] | null = null;
  try {
    sessions = await listSessions(token);
  } catch (error) {
    console.error('Settings: failed to load sessions', error);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-10 sm:px-6 lg:px-10 md:pt-14">
      <p className="text-sm text-ink-soft">
        <Link href="/account" className="hover:text-ink hover:underline">
          Кабинет
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-[2.6rem]">Настройки</h1>
      <p className="mt-2 text-ink-soft">
        {USER_ROLE_LABELS[user.role]} · {user.email}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Разделы настроек" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink-soft transition-colors duration-150 hover:text-ink lg:flex lg:rounded-xl lg:border-transparent lg:bg-transparent lg:px-3 lg:hover:bg-ink/5"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Section
            id="profile"
            title="Профиль"
            text="Фото и контакты, которые видите вы и площадка."
          >
            <div className="space-y-6">
              <AvatarUploader name={user.name} avatarVersion={user.avatarVersion} />
              <ProfileForm user={user} />
            </div>
          </Section>

          <Section
            id="appearance"
            title="Оформление"
            text="Тема, размер интерфейса и анимации. Сохраняются сразу и действуют на всех ваших устройствах."
          >
            <AppearanceForm preferences={user.preferences} />
          </Section>

          <Section id="security" title="Пароль" text="Для смены нужен текущий пароль.">
            <PasswordForm />
          </Section>

          <Section
            id="devices"
            title="Устройства"
            text="Где выполнен вход в аккаунт. Если устройство вам незнакомо, завершите сеанс и смените пароль."
          >
            {sessions ? (
              <SessionsList sessions={sessions} />
            ) : (
              <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">
                Не удалось загрузить список устройств. Обновите страницу чуть позже.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
