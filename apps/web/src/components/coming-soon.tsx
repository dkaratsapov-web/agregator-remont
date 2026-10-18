import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { PageHeader, secondaryLinkClass } from './ui/page-header';
import { Sheet, SheetHeader } from './ui/sheet';

interface Props {
  title: string;
  next: string;
  /** Что будет в разделе, когда он заработает. */
  points: string[];
}

/** Раздел кабинета, который ещё в разработке: честно говорим, что будет, и куда пойти сейчас. */
export async function ComingSoon({ title, next, points }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        back={{ href: '/account', label: 'Кабинет' }}
        title={title}
        description="Раздел в разработке. Появится в одном из ближайших обновлений."
      />
      <div className="mt-8 max-w-3xl">
        <Sheet labelledBy="soon-title">
          <SheetHeader id="soon-title" title="Что здесь будет" />
          <ul className="divide-y divide-line">
            {points.map((point) => (
              <li key={point} className="flex gap-3 px-5 py-3.5 text-ink sm:px-6">
                <span
                  aria-hidden="true"
                  className="mt-[0.6em] size-1.5 shrink-0 rounded-[1px] bg-accent"
                />
                {point}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-6">
            <p className="text-sm text-ink-soft">Пока можно работать с заказами в кабинете.</p>
            <Link href="/account" className={secondaryLinkClass}>
              В личный кабинет
            </Link>
          </div>
        </Sheet>
      </div>
    </div>
  );
}
