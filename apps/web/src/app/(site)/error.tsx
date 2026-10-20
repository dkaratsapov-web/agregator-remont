'use client';

import { ApiUnavailable } from '@/components/api-unavailable';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <ApiUnavailable
        title="Не удалось загрузить страницу"
        action={
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-hover active:scale-[0.97]"
          >
            Повторить
          </button>
        }
      />
    </div>
  );
}
