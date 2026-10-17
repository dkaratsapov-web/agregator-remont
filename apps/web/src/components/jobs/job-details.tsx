import {
  groupJobDetails,
  jobDetailHighlights,
  summarizeJobDetails,
  type JobCategory,
  type JobDetailItem,
  type JobDetails as JobDetailsData,
} from '@agregator/shared';

interface Props {
  category: JobCategory;
  details: JobDetailsData;
  /** Уровень заголовка блока. */
  headingLevel?: 2 | 3;
}

/** Блок «Подробности»: ответы анкеты по разделам. Ничего не выводит, если анкета пуста. */
export function JobDetails({ category, details, headingLevel = 2 }: Props) {
  const items = summarizeJobDetails(category, details);
  if (items.length === 0) return null;
  const sections = groupJobDetails(items);
  const Heading = `h${headingLevel}` as const;
  const Sub = `h${headingLevel + 1}` as 'h3' | 'h4';

  return (
    <section aria-labelledby="job-details-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading id="job-details-title" className="text-lg font-semibold">
          Подробности
        </Heading>
        <p className="text-sm text-ink-soft tabular-nums">Ответов: {items.length}</p>
      </div>
      <div className="mt-4 space-y-4">
        {sections.map((section) => {
          const units = toUnits(section.items);
          return (
            <div
              key={section.id}
              className="rounded-[22px] border border-line/80 bg-surface p-5 shadow-[0_1px_1px_hsl(var(--shadow-color)/0.04)] sm:p-6"
            >
              <Sub className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
                {section.title}
              </Sub>
              <dl className={`mt-4 gap-x-10 ${units.length > 1 ? 'md:columns-2' : ''}`}>
                {units.map(({ item, children }) => (
                  <div key={item.id} className="mb-5 break-inside-avoid last:mb-0">
                    <dt className="text-sm text-ink-soft">{item.label}</dt>
                    <dd className="mt-1">
                      <AnswerValue item={item} />
                      {children.length > 0 ? (
                        <dl className="mt-3 space-y-3 border-l-2 border-accent/25 pl-3.5">
                          {children.map((child) => (
                            <div
                              key={child.id}
                              style={{ marginLeft: `${(child.depth - 1) * 0.875}rem` }}
                            >
                              <dt className="text-[13px] text-ink-soft">{child.label}</dt>
                              <dd className="mt-0.5">
                                <AnswerValue item={child} />
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Ответ верхнего уровня вместе со всеми вложенными уточнениями. */
function toUnits(items: readonly JobDetailItem[]) {
  const units: { item: JobDetailItem; children: JobDetailItem[] }[] = [];
  for (const item of items) {
    const last = units[units.length - 1];
    if (item.depth > 0 && last) last.children.push(item);
    else units.push({ item, children: [] });
  }
  return units;
}

function AnswerValue({ item }: { item: JobDetailItem }) {
  if (item.values.length > 1) {
    return (
      <ul className="flex flex-wrap gap-1.5 pt-0.5">
        {item.values.map((value) => (
          <li
            key={value}
            className="rounded-full bg-canvas px-2.5 py-1 text-sm font-medium text-ink"
          >
            {value}
          </li>
        ))}
      </ul>
    );
  }
  return <span className="text-[15px] font-medium leading-snug text-ink">{item.value}</span>;
}

/** Ключевые ответы анкеты короткими плашками (карточка в каталоге, шапка заказа). */
export function JobHighlights({
  category,
  details,
  limit = 4,
  size = 'sm',
}: {
  category: JobCategory;
  details: JobDetailsData;
  limit?: number;
  size?: 'sm' | 'md';
}) {
  const highlights = jobDetailHighlights(category, details, limit);
  if (highlights.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Главное о заказе">
      {highlights.map((text) => (
        <li
          key={text}
          className={`inline-flex items-center rounded-full border border-line/80 bg-canvas font-medium text-ink ${
            size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
          }`}
        >
          {text}
        </li>
      ))}
    </ul>
  );
}
