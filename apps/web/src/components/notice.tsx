export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-xl bg-ok-tint px-4 py-3 text-sm font-medium text-ok">
      {children}
    </p>
  );
}
