import { JOB_CATEGORY_LABELS, REVIEW_LIMITS, type PublicContractorDto } from '@agregator/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiUnavailable } from '@/components/api-unavailable';
import { RatingLine } from '@/components/reviews/rating-line';
import { EmptyState, PageHeader } from '@/components/ui/page-header';
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { getContractor } from '@/lib/api';
import { formatDate, formatYears } from '@/lib/format';
import { parsePage } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Карточка мастера', robots: { index: false } };

const stars = (rating: number) =>
  '★'.repeat(rating) + '☆'.repeat(REVIEW_LIMITS.RATING_MAX - rating);

export default async function ContractorPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  if (!/^\d{1,10}$/.test(publicId)) notFound();
  const page = parsePage(query.page);
  let card: PublicContractorDto | null;
  try {
    card = await getContractor(publicId, page);
  } catch (error) {
    console.error('Contractor card: failed to load', error);
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <ApiUnavailable />
      </div>
    );
  }
  if (!card) notFound();
  const profile = card.profile;

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:px-10">
      <PageHeader
        back={{ href: '/jobs', label: 'Каталог заказов' }}
        title={card.name}
        description={`Мастер на сервисе с ${formatDate(card.memberSince)}. Контакты не показываются: общение — через сервис после выбора исполнителя.`}
      >
        <RatingLine rating={card.rating} />
      </PageHeader>

      <div className="mt-8 grid max-w-5xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Sheet labelledBy="reviews-title">
          <SheetHeader
            id="reviews-title"
            title="Отзывы заказчиков"
            description="Отзыв оставляет только заказчик, который закрыл заказ с этим мастером как выполненный."
          />
          {card.reviews.length === 0 ? (
            <EmptyState title="Отзывов пока нет">
              Отзывы появятся после выполненных заказов.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {card.reviews.map((review) => (
                <li key={review.id} className="px-5 py-4 sm:px-6">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-accent" aria-label={`Оценка ${review.rating} из 5`}>
                      {stars(review.rating)}
                    </span>
                    <time dateTime={review.createdAt} className="text-sm text-ink-soft">
                      {formatDate(review.createdAt)}
                    </time>
                  </p>
                  {review.text ? (
                    <p className="mt-2 whitespace-pre-line text-ink [overflow-wrap:anywhere]">
                      {review.text}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-sm text-ink-soft [overflow-wrap:anywhere]">
                    {review.authorName}, заказ «{review.jobTitle}»
                  </p>
                </li>
              ))}
            </ul>
          )}
          {page > 1 || card.hasMoreReviews ? (
            <nav
              aria-label="Страницы отзывов"
              className="flex items-center justify-between border-t border-line px-5 py-2.5 text-sm font-semibold sm:px-6"
            >
              {page > 1 ? (
                <Link href={`/contractors/${card.publicId}?page=${page - 1}`}>Новее</Link>
              ) : (
                <span />
              )}
              {card.hasMoreReviews ? (
                <Link href={`/contractors/${card.publicId}?page=${page + 1}`}>Раньше</Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </Sheet>

        <Sheet labelledBy="about-title">
          <SheetHeader id="about-title" title="О мастере" />
          <SheetBody>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-ink-soft">Выполнено заказов на сервисе</dt>
                <dd className="font-semibold tabular-nums text-ink">{card.completedJobs}</dd>
              </div>
              {profile?.experienceYears !== null && profile?.experienceYears !== undefined ? (
                <div>
                  <dt className="text-ink-soft">Опыт</dt>
                  <dd className="text-ink">{formatYears(profile.experienceYears)}</dd>
                </div>
              ) : null}
              {profile && profile.categories.length > 0 ? (
                <div>
                  <dt className="text-ink-soft">Виды работ</dt>
                  <dd className="text-ink">
                    {profile.categories.map((c) => JOB_CATEGORY_LABELS[c]).join(', ')}
                  </dd>
                </div>
              ) : null}
              {profile && profile.cities.length > 0 ? (
                <div>
                  <dt className="text-ink-soft">Города</dt>
                  <dd className="text-ink">{profile.cities.join(', ')}</dd>
                </div>
              ) : null}
            </dl>
            {profile?.about ? (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
                {profile.about}
              </p>
            ) : (
              <p className="mt-4 text-sm text-ink-soft">Мастер пока не рассказал о себе.</p>
            )}
          </SheetBody>
        </Sheet>
      </div>
    </div>
  );
}
