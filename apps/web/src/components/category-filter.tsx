import { JOB_CATEGORIES, JOB_CATEGORY_LABELS, type JobCategory } from '@agregator/shared';
import Link from 'next/link';
import { jobsHref, type JobsFilters } from '@/lib/search-params';

/** Категории; текст поиска, город и «только открытые» сохраняются при переключении. */
export function CategoryFilter({ filters }: { filters: JobsFilters }) {
  const active = filters.category;
  const items: { key: JobCategory | undefined; label: string }[] = [
    { key: undefined, label: 'Все категории' },
    ...JOB_CATEGORIES.map((key) => ({ key, label: JOB_CATEGORY_LABELS[key] })),
  ];

  return (
    <nav aria-label="Категории">
      <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {items.map(({ key, label }) => {
          const current = key === active;
          return (
            <li key={label} className="snap-start">
              <Link
                href={jobsHref({ ...filters, category: key })}
                aria-current={current ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors duration-150 ${
                  current
                    ? 'border-ink bg-ink text-canvas'
                    : 'border-line bg-surface text-ink-soft hover:border-ink-soft/50 hover:text-ink'
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
