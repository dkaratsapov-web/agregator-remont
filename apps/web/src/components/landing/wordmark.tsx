/** Временный знак «Гарантыч» до готового логотипа: изометрический блок + название. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-8 shrink-0">
        <rect width="32" height="32" rx="9" fill="var(--ink)" />
        <path
          d="M16 7.5 24 12v9l-8 4.5L8 21v-9z"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M16 16.5 24 12M16 16.5 8 12M16 16.5v9"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.45"
          strokeWidth="1.2"
        />
        <path d="M16 16.5 24 12v9l-8 4.5z" fill="var(--accent)" />
      </svg>
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">
        Гарантыч
      </span>
    </span>
  );
}
