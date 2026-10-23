import { REVIEW_LIMITS, type JobReviewStateDto } from '@agregator/shared';
import Link from 'next/link';
import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { formatDate } from '@/lib/format';
import { ReviewForm } from './review-form';

/** Отзыв по выполненному заказу на странице заказа владельца. */
export function ReviewPanel({ jobId, state }: { jobId: string; state: JobReviewStateDto }) {
  if (!state.contractor) return null;
  const card = `/contractors/${state.contractor.publicId}`;
  return (
    <Sheet labelledBy="review-title" id="review">
      <SheetHeader
        id="review-title"
        title="Отзыв об исполнителе"
        description={
          state.review
            ? undefined
            : `Заказ выполнен. Оцените работу: ${state.contractor.name}. Отзыв поможет другим заказчикам.`
        }
      />
      <SheetBody>
        {state.review ? (
          <div>
            <p className="text-accent" aria-label={`Ваша оценка ${state.review.rating} из 5`}>
              {'★'.repeat(state.review.rating)}
              {'☆'.repeat(REVIEW_LIMITS.RATING_MAX - state.review.rating)}
            </p>
            {state.review.text ? (
              <p className="mt-2 whitespace-pre-line text-ink [overflow-wrap:anywhere]">
                {state.review.text}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-ink-soft">
              Оставлен {formatDate(state.review.createdAt)}.{' '}
              <Link href={card} className="font-semibold text-ink underline underline-offset-4">
                Карточка мастера
              </Link>
            </p>
          </div>
        ) : state.canReview ? (
          <ReviewForm jobId={jobId} />
        ) : null}
      </SheetBody>
    </Sheet>
  );
}
