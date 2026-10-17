import Link from 'next/link';
import { jobsHref, type JobsFilters } from '@/lib/search-params';

interface Props {
  page: number;
  totalPages: number;
  filters: JobsFilters;
}

/** Номера страниц с многоточиями: 1 … 4 5 6 … 12. */
function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('gap');
    result.push(p);
  });
  return result;
}

const base =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-medium tabular-nums';

export function Pagination({ page, totalPages, filters }: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Страницы каталога" className="mt-10 flex justify-center">
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {page > 1 ? (
            <Link
              href={jobsHref({ ...filters, page: page - 1 })}
              className={`${base} text-ink hover:bg-muted-tint`}
              rel="prev"
            >
              Назад
            </Link>
          ) : (
            <span className={`${base} text-ink-soft/60`} aria-disabled="true">
              Назад
            </span>
          )}
        </li>
        {pageWindow(page, totalPages).map((p, i) =>
          p === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink-soft">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={jobsHref({ ...filters, page: p })}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Страница ${p}`}
                className={`${base} ${
                  p === page ? 'bg-ink text-canvas' : 'text-ink hover:bg-muted-tint'
                }`}
              >
                {p}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < totalPages ? (
            <Link
              href={jobsHref({ ...filters, page: page + 1 })}
              className={`${base} text-ink hover:bg-muted-tint`}
              rel="next"
            >
              Вперёд
            </Link>
          ) : (
            <span className={`${base} text-ink-soft/60`} aria-disabled="true">
              Вперёд
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
