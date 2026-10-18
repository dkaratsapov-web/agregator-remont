import { USER_ROLE_LABELS, type SessionDto } from '@agregator/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppearanceForm } from '@/components/account/appearance-form';
import { CopyId } from '@/components/account/copy-id';
import { AvatarUploader } from '@/components/account/avatar-uploader';
import { PasswordForm } from '@/components/account/password-form';
import { ProfileForm } from '@/components/account/profile-form';
import { SessionsList } from '@/components/account/sessions-list';
import { PageHeader } from '@/components/ui/page-header';
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { BankLinks } from '@/components/account/bank-links';
import { getBankProviders, getLinkedBanks, listSessions } from '@/lib/api';
import { bankErrorMessage, isBankId } from '@/lib/bank-login';
import { getCurrentUser, getSessionToken } from '@/lib/session';

export const metadata: Metadata = { title: 'Настройки', robots: { index: false } };

const SECTIONS = [
  { id: 'profile', title: 'Профиль' },
  { id: 'appearance', title: 'Оформление' },
  { id: 'security', title: 'Пароль' },
  { id: 'banks', title: 'Вход через банк' },
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
    <div id={id} className="scroll-mt-24">
      <Sheet labelledBy={`${id}-title`}>
        <SheetHeader id={`${id}-title`} title={title} description={text} />
        <SheetBody className="sm:py-6">{children}</SheetBody>
      </Sheet>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, token, query, banks] = await Promise.all([
    getCurrentUser(),
    getSessionToken(),
    searchParams,
    getBankProviders(),
  ]);
  if (!user || !token) redirect('/login?next=/account/settings');
  const one = (key: string) => (Array.isArray(query[key]) ? query[key][0] : query[key]);
  const bank = one('bank');
  const bankError = bankErrorMessage(one('bank_error'), isBankId(bank) ? bank : undefined);
  const bankLinked = one('bank_linked') === '1' && isBankId(bank) ? bank : undefined;
  let linked: { provider: string }[] = [];
  if (banks.length > 0) {
    try {
      linked = await getLinkedBanks(token);
    } catch (error) {
      console.error('Settings: failed to load linked banks', error);
    }
  }

  let sessions: SessionDto[] | null = null;
  try {
    sessions = await listSessions(token);
  } catch (error) {
    console.error('Settings: failed to load sessions', error);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title="Настройки"
        description={`${USER_ROLE_LABELS[user.role]} · ${user.email}`}
      >
        <CopyId publicId={user.publicId} />
      </PageHeader>

      <div className="mt-8 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Разделы настроек" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0 lg:divide-y lg:divide-line lg:overflow-hidden lg:rounded-[14px] lg:border lg:border-line lg:bg-surface lg:px-0">
            {SECTIONS.filter((s) => s.id !== 'banks' || banks.length > 0).map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-10 items-center whitespace-nowrap rounded-[8px] border border-line bg-surface px-3.5 text-sm font-medium text-ink-soft transition-colors duration-150 hover:text-ink lg:flex lg:min-h-11 lg:rounded-none lg:border-0 lg:px-4 lg:hover:bg-canvas"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 max-w-5xl flex-col gap-6">
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

          {banks.length > 0 ? (
            <Section
              id="banks"
              title="Вход через банк"
              text="Привяжите банк, чтобы входить без пароля. Банк передаёт только имя, email и телефон."
            >
              <BankLinks
                banks={banks}
                linked={linked.map((l) => l.provider)}
                error={bankError}
                justLinked={bankLinked}
              />
            </Section>
          ) : null}

          <Section
            id="devices"
            title="Устройства"
            text="Где выполнен вход в аккаунт. Если устройство вам незнакомо, завершите сеанс и смените пароль."
          >
            {sessions ? (
              <SessionsList sessions={sessions} />
            ) : (
              <p className="rounded-[10px] border border-dashed border-line p-4 text-sm text-ink-soft">
                Не удалось загрузить список устройств. Обновите страницу чуть позже.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
