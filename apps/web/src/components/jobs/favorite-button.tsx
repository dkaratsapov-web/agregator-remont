'use client';

import { useActionState } from 'react';
import { favoriteFormAction, type FavoriteState } from '@/app/(site)/account/favorites/actions';
import { FormArgs } from '@/components/ui/form-args';

/** «В избранное» / «Убрать из избранного»; работает и без JS. */
export function FavoriteButton({
  jobId,
  favorite,
  returnTo,
}: {
  jobId: string;
  favorite: boolean;
  returnTo: string;
}) {
  const [state, action, pending] = useActionState<FavoriteState, FormData>(favoriteFormAction, {});
  return (
    <form action={action} className="space-y-1.5">
      <FormArgs values={[jobId, !favorite, returnTo]} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={favorite}
        className="inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition-colors duration-150 hover:border-ink/30 disabled:cursor-wait disabled:opacity-70 aria-pressed:border-accent/50 aria-pressed:text-accent-hover"
      >
        <span aria-hidden="true">{favorite ? '♥' : '♡'}</span>
        {favorite ? 'В избранном' : 'В избранное'}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-accent">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
