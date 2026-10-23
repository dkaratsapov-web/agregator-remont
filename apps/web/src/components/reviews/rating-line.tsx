import { reviewsWord, type ContractorRatingDto } from '@agregator/shared';
import Link from 'next/link';

const oneDecimal = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** «4,5 из 5 · 12 отзывов» или «Отзывов пока нет»; со ссылкой на карточку мастера. */
export function RatingLine({
  rating,
  publicId,
}: {
  rating: ContractorRatingDto;
  publicId?: number;
}) {
  const text =
    rating.average === null ? (
      'Отзывов пока нет'
    ) : (
      <>
        <span aria-hidden="true" className="text-accent">
          ★
        </span>{' '}
        <span className="font-semibold text-ink tabular-nums">
          {oneDecimal.format(rating.average)}
        </span>
        <span className="sr-only"> из 5</span>, <span className="tabular-nums">{rating.count}</span>{' '}
        {reviewsWord(rating.count)}
      </>
    );
  return (
    <p className="text-sm text-ink-soft">
      {text}
      {publicId ? (
        <>
          {' · '}
          <Link
            href={`/contractors/${publicId}`}
            className="font-semibold text-ink underline decoration-ink/25 underline-offset-4 hover:decoration-accent"
          >
            Карточка мастера
          </Link>
        </>
      ) : null}
    </p>
  );
}
