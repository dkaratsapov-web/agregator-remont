import { JOB_CATEGORY_LABELS, type JobDraftDto } from '@agregator/shared';
import Link from 'next/link';
import { deleteDraftAction } from '@/app/(site)/account/jobs/actions';
import { formatDate } from '@/lib/format';
import { DeleteDraftButton } from './delete-draft-button';

/** Черновики заказчика строками листа: продолжить заполнение или удалить. */
export function DraftList({ drafts }: { drafts: JobDraftDto[] }) {
  return (
    <ul className="divide-y divide-line">
      {drafts.map((draft) => {
        const facts = [
          draft.category ? JOB_CATEGORY_LABELS[draft.category] : null,
          draft.city,
        ].filter(Boolean);
        return (
          <li
            key={draft.id}
            className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6"
          >
            <Link href={`/account/jobs/new?draft=${draft.id}`} className="group min-w-0">
              <span className="block font-semibold text-ink [overflow-wrap:anywhere] group-hover:underline group-hover:decoration-accent group-hover:underline-offset-4">
                {draft.title ?? 'Без названия'}
              </span>
              <span className="mt-0.5 block text-sm text-ink-soft">
                {facts.length > 0 ? `${facts.join(' · ')} · изменён` : 'Изменён'}{' '}
                <time dateTime={draft.updatedAt}>{formatDate(draft.updatedAt)}</time>
              </span>
            </Link>
            <span className="flex shrink-0 items-center gap-2">
              <Link
                href={`/account/jobs/new?draft=${draft.id}`}
                className="inline-flex min-h-10 items-center rounded-[10px] bg-ink px-4 text-sm font-semibold text-canvas transition-[background-color,transform] duration-150 hover:bg-ink/85 active:scale-[0.97]"
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
