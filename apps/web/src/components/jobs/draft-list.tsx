import { JOB_CATEGORY_LABELS, type JobDraftDto } from '@agregator/shared';
import Link from 'next/link';
import { deleteDraftAction } from '@/app/(site)/account/jobs/actions';
import { formatDate } from '@/lib/format';
import { DeleteDraftButton } from './delete-draft-button';

/** Черновики заказчика: продолжить заполнение или удалить. */
export function DraftList({ drafts }: { drafts: JobDraftDto[] }) {
  return (
    <ul className="divide-y divide-line rounded-2xl border border-dashed border-line bg-surface">
      {drafts.map((draft) => {
        const facts = [
          draft.category ? JOB_CATEGORY_LABELS[draft.category] : null,
          draft.city,
        ].filter(Boolean);
        return (
          <li
            key={draft.id}
            className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <Link href={`/account/jobs/new?draft=${draft.id}`} className="group min-w-0">
              <span className="block break-words font-semibold group-hover:underline">
                {draft.title ?? 'Без названия'}
              </span>
              <span className="mt-0.5 block text-sm text-ink-soft">
                {facts.length > 0 ? `${facts.join(', ')}, изменён` : 'Изменён'}{' '}
                <time dateTime={draft.updatedAt}>{formatDate(draft.updatedAt)}</time>
              </span>
            </Link>
            <span className="flex shrink-0 items-center gap-2">
              <Link
                href={`/account/jobs/new?draft=${draft.id}`}
                className="inline-flex min-h-10 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-canvas transition-colors duration-150 hover:bg-ink/85"
              >
                Продолжить
              </Link>
              <form action={deleteDraftAction.bind(null, draft.id)}>
                <DeleteDraftButton />
              </form>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
