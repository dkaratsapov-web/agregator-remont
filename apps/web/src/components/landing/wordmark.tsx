/** Знак «Гарантыча»: буква «Г» и терракотовый «щит», рядом название. */
export function Mark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 444 456" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path
        d="M10 80Q10 12 78 12H432L368 104Q362 110 352 110H122Q108 110 108 124V410L10 393Z"
        fill="var(--ink, #0d1320)"
      />
      <path d="M188 258L362 184Q370 181 370 190V270Q370 340 300 390L188 446Z" fill="#c2410c" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className="h-7 w-auto" />
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">
        Гарантыч
      </span>
    </span>
  );
}
