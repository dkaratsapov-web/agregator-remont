import type { Metadata } from 'next';
import Link from 'next/link';
import { ApiUnavailable } from '@/components/api-unavailable';
import { ContractorsOnly } from '@/components/jobs/contractors-only';
import { Notice } from '@/components/notice';
import { ProfileForm } from '@/components/profile/profile-form';
import { getMyProfile } from '@/lib/api';
import { requireContractorPage } from '@/lib/customer';
import { saveProfileAction } from './actions';

export const metadata: Metadata = { title: 'Профиль подрядчика', robots: { index: false } };

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

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6 md:pt-14">
      <p className="text-sm text-ink-soft">
        <Link href="/account" className="hover:text-ink hover:underline">
          Кабинет
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Профиль подрядчика</h1>
      <p className="mt-2 text-ink-soft">Заказчики видят профиль вместе с вашими откликами.</p>
      {query.saved ? (
        <div className="mt-6">
          <Notice>Профиль сохранён.</Notice>
        </div>
      ) : null}
      <div className="mt-8">
        <ProfileForm
          action={saveProfileAction}
          initial={{
            about: profile.about,
            categories: profile.categories,
            cities: profile.cities.join(', '),
            experienceYears: profile.experienceYears?.toString() ?? '',
          }}
        />
      </div>
    </div>
  );
}
