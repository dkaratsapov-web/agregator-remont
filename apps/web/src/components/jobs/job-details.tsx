import {
  JOB_CATEGORY_LABELS,
  groupJobDetails,
  jobDetailHighlights,
  summarizeJobDetails,
  type JobCategory,
  type JobDetailItem,
  type JobDetails as JobDetailsData,
  type JobDto,
} from '@agregator/shared';

interface Props {
  category: JobCategory;
  details: JobDetailsData;
  /** Уровень заголовка блока. */
  headingLevel?: 2 | 3;
  /** Заголовок блока; в заказе с несколькими позициями — название категории. */
  title?: string;
  /** Уникальная часть id заголовка, если блоков на странице несколько. */
  idSuffix?: string;
}

/** Блок «Подробности»: ответы анкеты по разделам. Ничего не выводит, если анкета пуста. */
export function JobDetails({
  category,
  details,
  headingLevel = 2,
  title = 'Подробности',
  idSuffix = '',
}: Props) {
  const items = summarizeJobDetails(category, details);
  if (items.length === 0) return null;
  const sections = groupJobDetails(items);
  const Heading = `h${headingLevel}` as const;
  const Sub = `h${headingLevel + 1}` as 'h3' | 'h4';

  return (
    <section aria-labelledby={`job-details-title${idSuffix}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading id={`job-details-title${idSuffix}`} className="text-lg font-semibold">
          {title}
        </Heading>
        <p className="text-sm text-ink-soft tabular-nums">Ответов: {items.length}</p>
      </div>
      <div className="mt-4 space-y-3">
        {sections.map((section) => {
          const units = toUnits(section.items);
          return (
            <div
              key={section.id}
              className="overflow-hidden rounded-[14px] border border-line bg-surface"
            >
              <Sub className="border-b border-line px-5 py-3 text-sm font-semibold text-ink sm:px-6">
                {section.title}
              </Sub>
              <dl
                className={`gap-x-10 px-5 py-4 sm:px-6 sm:py-5 ${units.length > 1 ? 'md:columns-2' : ''}`}
              >
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
            className="rounded-[7px] border border-line bg-canvas px-2.5 py-1 text-sm font-medium text-ink"
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
          className={`inline-flex items-center rounded-[7px] border border-line bg-canvas font-medium text-ink ${
            size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
          }`}
        >
          {text}
        </li>
      ))}
    </ul>
  );
}

/**
 * Подробности всех позиций заказа: у заказа с одной категорией — обычный блок «Подробности»,
 * с несколькими — по блоку на категорию.
 */
export function JobPositionsDetails({
  job,
  headingLevel = 2,
}: {
  job: Pick<JobDto, 'category' | 'details' | 'extraItems'>;
  headingLevel?: 2 | 3;
}) {
  if (job.extraItems.length === 0) {
    return <JobDetails category={job.category} details={job.details} headingLevel={headingLevel} />;
  }
  const positions = [{ category: job.category, details: job.details }, ...job.extraItems];
  return (
    <div className="space-y-8">
      {positions.map((position, index) => (
        <JobDetails
          key={position.category}
          category={position.category}
          details={position.details}
          headingLevel={headingLevel}
          title={JOB_CATEGORY_LABELS[position.category]}
          idSuffix={`-${index + 1}`}
        />
      ))}
    </div>
  );
}

/** Подписи всех категорий заказа: основная первой. */
export function jobCategoryLabels(job: Pick<JobDto, 'category' | 'extraItems'>): string[] {
  return [job.category, ...job.extraItems.map((item) => item.category)].map(
    (category) => JOB_CATEGORY_LABELS[category],
  );
}
