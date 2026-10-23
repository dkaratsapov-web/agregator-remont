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
      <div className="spec mt-3">
        {sections.map((section, s) => (
          <div key={section.id} className="spec-section">
            <Sub className="spec-head">
              <span className="font-display text-[13px] font-semibold tracking-[-0.01em] text-ink">
                {section.title}
              </span>
            </Sub>
            <dl className="spec-grid">
              {section.items.map((item, i) => (
                <div
                  key={item.id}
                  style={{ '--i': s * 4 + i } as React.CSSProperties}
                  className={`spec-cell ${item.depth > 0 ? 'spec-cell--sub' : ''}`}
                >
                  <dt className="text-[12.5px] leading-snug text-ink-soft">{item.label}</dt>
                  <dd className="mt-1">
                    <AnswerValue item={item} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Число с единицей («10 м²», «10 м пог.»): число крупно, как замер рулеткой. */
const MEASURE = /^(\d[\d\s.,]*)\s+(\S.*)$/;

function AnswerValue({ item }: { item: JobDetailItem }) {
  if (item.values.length > 1) {
    return (
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {item.values.map((value) => (
          <li key={value} className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-[1px] bg-accent" />
            {value}
          </li>
        ))}
      </ul>
    );
  }
  const measure = MEASURE.exec(item.value);
  if (measure) {
    return (
      <span className="inline-flex items-baseline gap-1 text-ink">
        <span className="font-display text-[17px] font-semibold tabular-nums tracking-[-0.02em]">
          {measure[1].trim()}
        </span>
        <span className="text-[13px] text-ink-soft">{measure[2]}</span>
      </span>
    );
  }
  return <span className="text-sm font-medium leading-snug text-ink">{item.value}</span>;
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
