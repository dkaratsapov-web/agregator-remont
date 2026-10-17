export type FeatureStatus = 'live' | 'soon' | 'partial';

const LABELS: Record<FeatureStatus, string> = {
  live: 'Работает',
  partial: 'Частично',
  soon: 'Скоро',
};

/** Честная пометка готовности: что уже работает в бете, а что в разработке. */
export function StatusPill({ status }: { status: FeatureStatus }) {
  const tone =
    status === 'live'
      ? 'bg-ok-tint text-ok'
      : status === 'partial'
        ? 'bg-accent-tint text-accent-hover'
        : 'bg-sunken text-ink-soft';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${status === 'soon' ? 'bg-ink-soft/50' : 'bg-current'}`}
      />
      {LABELS[status]}
    </span>
  );
}
