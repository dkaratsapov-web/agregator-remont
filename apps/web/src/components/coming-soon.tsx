import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';

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
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        Раздел в разработке
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-[2.6rem]">{title}</h1>
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <p className="font-semibold">Что здесь будет</p>
        <ul className="mt-4 space-y-3 text-ink-soft">
          {points.map((point) => (
            <li key={point} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-accent"
              />
              {point}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-ink-soft">
          Раздел появится в одном из ближайших обновлений. Пока можно работать с заказами в
          кабинете.
        </p>
        <Link
          href="/account"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas transition-[background-color,transform] duration-200 hover:bg-[#1c2536] active:scale-[0.97]"
        >
          В личный кабинет
        </Link>
      </div>
    </div>
  );
}
