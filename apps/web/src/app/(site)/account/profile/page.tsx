import { JOB_CATEGORY_LABELS } from '@agregator/shared';
import type { Metadata } from 'next';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ContractorsOnly } from '@/components/jobs/contractors-only';
import { Notice } from '@/components/notice';
import { ProfileForm } from '@/components/profile/profile-form';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressRuler } from '@/components/ui/progress-ruler';
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { Stamp, StampEmpty } from '@/components/ui/stamp';
import { getMyProfile } from '@/lib/api';
import { requireContractorPage } from '@/lib/customer';
import { formatYears } from '@/lib/format';
import { saveProfileAction } from './actions';

export const metadata: Metadata = { title: 'Профиль мастера', robots: { index: false } };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([
    requireContractorPage('/account/profile'),
    searchParams,
  ]);
  if (!token) return <ContractorsOnly />;

  let profile: Awaited<ReturnType<typeof getMyProfile>>;
  try {
    profile = await getMyProfile(token);
  } catch (error) {
    console.error('Profile: failed to load', error);
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <ApiUnavailable />
      </div>
    );
  }

  const checks: [string, React.ReactNode, boolean][] = [
    [
      'Категории',
      profile.categories.length > 0
        ? profile.categories.map((c) => JOB_CATEGORY_LABELS[c]).join(', ')
        : null,
      profile.categories.length > 0,
    ],
    [
      'Города',
      profile.cities.length > 0 ? profile.cities.join(', ') : null,
      profile.cities.length > 0,
    ],
    [
      'Опыт',
      profile.experienceYears !== null ? formatYears(profile.experienceYears) : null,
      profile.experienceYears !== null,
    ],
    ['О себе', profile.about.trim() ? 'заполнено' : null, profile.about.trim().length > 0],
  ];
  const done = checks.filter(([, , ok]) => ok).length;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title="Профиль мастера"
        description="Заказчики видят профиль вместе с вашими откликами."
      />
      {query.saved ? (
        <div className="mt-6">
          <Notice>Профиль сохранён.</Notice>
        </div>
      ) : null}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Sheet labelledBy="profile-form-title">
          <SheetHeader
            id="profile-form-title"
            title="О работе"
            description="Чем точнее категории и города, тем понятнее заказчику, что вы подходите."
          />
          <SheetBody>
            <ProfileForm
              action={saveProfileAction}
              initial={{
                about: profile.about,
                categories: profile.categories,
                cities: profile.cities.join(', '),
                experienceYears: profile.experienceYears?.toString() ?? '',
              }}
            />
          </SheetBody>
        </Sheet>
        <aside aria-label="Сводка профиля" className="lg:sticky lg:top-24">
          <Stamp
            ariaLabel="Сводка профиля мастера"
            label="Профиль мастера"
            title={done === checks.length ? 'Заполнен' : `Заполнено ${done} из ${checks.length}`}
            rows={[
              ...checks.map(
                ([name, value]) =>
                  [name, value ?? <StampEmpty key={name} />] as [string, React.ReactNode],
              ),
              [
                'Готовность',
                <ProgressRuler
                  key="r"
                  answered={done}
                  total={checks.length}
                  label="Заполнение профиля мастера"
                  className="mt-1"
                />,
              ],
            ]}
            footer="Показывается рядом с откликом"
          />
        </aside>
      </div>
    </div>
  );
}
