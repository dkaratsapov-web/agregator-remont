'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ children, pending }: { children: string; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={isPending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-6 text-base font-semibold text-accent-ink transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.97] disabled:cursor-wait disabled:opacity-70"
    >
      {isPending ? pending : children}
    </button>
  );
}
