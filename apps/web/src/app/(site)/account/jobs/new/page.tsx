import type { Metadata } from 'next';
import Link from 'next/link';
import { CustomersOnly } from '@/components/jobs/customers-only';
import { JobForm } from '@/components/jobs/job-form';
import { requireCustomerPage } from '@/lib/customer';
import { createJobAction } from '../actions';

export const metadata: Metadata = { title: 'Новый заказ', robots: { index: false } };

export default async function NewJobPage() {
  const { token } = await requireCustomerPage('/account/jobs/new');
  if (!token) return <CustomersOnly />;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6 md:pt-14">
      <p className="text-sm text-ink-soft">
        <Link href="/account/jobs" className="hover:text-ink hover:underline">
          Мои заказы
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Новый заказ</h1>
      <p className="mt-2 text-ink-soft">После публикации заказ сразу появится в каталоге.</p>
      <div className="mt-8">
        <JobForm
          action={createJobAction}
          submitLabel="Опубликовать заказ"
          pendingLabel="Публикуем…"
        />
      </div>
    </div>
  );
}
