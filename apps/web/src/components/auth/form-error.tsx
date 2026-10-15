export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-accent/40 bg-accent-tint px-4 py-3 text-sm text-ink"
    >
      {message}
    </p>
  );
}
