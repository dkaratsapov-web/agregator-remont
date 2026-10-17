'use client';

import {
  isJobCategory,
  JOB_CATEGORIES,
  JOB_CATEGORY_LABELS,
  JOB_LIMITS,
  SERVICE_AREA_ERROR,
  validateJobDetails,
  type JobCategory,
  type JobDetails,
} from '@agregator/shared';
import { useActionState, useState } from 'react';
import type { JobFormState } from '@/app/(site)/account/jobs/actions';
import { Field } from '@/components/auth/field';
import { FormError } from '@/components/auth/form-error';
import { SubmitButton } from '@/components/auth/submit-button';
import { CityCombobox } from '@/components/ui/city-combobox';
import { CITY_GROUPS, CITY_OPTIONS } from '@/lib/city-options';
import { Select } from '@/components/ui/select';
import {
  checkJobForm,
  parseDetailsField,
  readJobForm,
  type JobFormIssue,
  type JobFormValues,
} from '@/lib/job-form';
import { JobQuestionnaire } from './job-questionnaire';

interface Props {
  action: (state: JobFormState, form: FormData) => Promise<JobFormState>;
  initial?: Partial<JobFormValues>;
  submitLabel: string;
  pendingLabel: string;
}

const CATEGORY_OPTIONS = JOB_CATEGORIES.map((category) => ({
  value: category,
  label: JOB_CATEGORY_LABELS[category],
}));
const FIELD_IDS: Record<JobFormIssue['field'], string> = {
  title: 'field-title',
  category: 'field-category',
  city: 'field-city',
  budget: 'field-budgetMin',
  description: 'field-description',
  details: 'job-questions',
};

/** Ответы, подходящие анкете категории (скрытые и некорректные отбрасываются). */
const fitAnswers = (category: JobCategory, answers: unknown): JobDetails => {
  const result = validateJobDetails(category, answers, { lenient: true });
  return result.ok ? result.details : {};
};

export function JobForm({ action, initial = {}, submitLabel, pendingLabel }: Props) {
  const [state, formAction] = useActionState<JobFormState, FormData>(action, {});
  const values = { ...initial, ...state.values };

  const [category, setCategory] = useState<JobCategory | ''>(() =>
    isJobCategory(values.category) ? values.category : '',
  );
  const [city, setCity] = useState(values.city ?? '');
  const [answersByCategory, setAnswersByCategory] = useState<
    Partial<Record<JobCategory, JobDetails>>
  >(() =>
    isJobCategory(values.category)
      ? { [values.category]: fitAnswers(values.category, parseDetailsField(values.details ?? '')) }
      : {},
  );
  const [issues, setIssues] = useState<JobFormIssue[]>(state.issues ?? []);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    setIssues(state.issues ?? []);
  }

  const answers = category ? (answersByCategory[category] ?? {}) : {};
  const detailsJson = category ? JSON.stringify(fitAnswers(category, answers)) : '{}';

  const issueOf = (field: JobFormIssue['field']) =>
    issues.find((issue) => issue.field === field)?.message;
  const questionErrors: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.field === 'details' && issue.questionId) {
      questionErrors[issue.questionId] ??= issue.message;
    }
  }
  const generalDetailsError = issues.find(
    (issue) => issue.field === 'details' && !issue.questionId,
  )?.message;

  const clearIssues = (field: JobFormIssue['field'], questionIds?: string[]) =>
    setIssues((current) =>
      current.filter((issue) =>
        issue.field !== field
          ? true
          : questionIds
            ? !questionIds.includes(issue.questionId ?? '')
            : false,
      ),
    );

  const chooseCategory = (next: string) => {
    if (!isJobCategory(next) || next === category) return;
    setAnswersByCategory((current) =>
      current[next] || !category
        ? current
        : // Общие ответы (тип объекта, сроки, материалы) переносятся в новую анкету.
          { ...current, [next]: fitAnswers(next, current[category] ?? {}) },
    );
    setCategory(next);
    setIssues((current) =>
      current.filter((issue) => issue.field !== 'category' && issue.field !== 'details'),
    );
  };

  const changeAnswers = (next: JobDetails) => {
    if (!category) return;
    const changed = Object.keys({ ...answers, ...next }).filter(
      (id) => JSON.stringify(answers[id]) !== JSON.stringify(next[id]),
    );
    setAnswersByCategory((current) => ({ ...current, [category]: next }));
    if (changed.length > 0) clearIssues('details', changed);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const checked = checkJobForm(readJobForm(new FormData(event.currentTarget)));
    if (checked.ok) return;
    event.preventDefault();
    setIssues(checked.issues);
    const first = checked.issues[0];
    const targetId =
      first.field === 'details' && first.questionId
        ? `q-${first.questionId}`
        : FIELD_IDS[first.field];
    const target = document.getElementById(targetId);
    if (target) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      const focusable = target.matches('input, textarea, button')
        ? target
        : target.querySelector<HTMLElement>('input, button, textarea, [tabindex="0"]');
      (focusable ?? target).focus({ preventScroll: true });
    }
  };

  const topError = issues.length > 0 ? 'Проверьте поля, отмеченные ниже.' : state.error;

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-6">
      <FormError message={topError} />

      <FormSection step={1} title="Основное">
        <Field
          label="Что нужно сделать"
          name="title"
          required
          minLength={JOB_LIMITS.TITLE_MIN}
          maxLength={JOB_LIMITS.TITLE_MAX}
          autoComplete="off"
          defaultValue={values.title}
          error={issueOf('title')}
          onInput={() => clearIssues('title')}
          hint="Коротко, например: «Укладка плитки в ванной»"
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p id="field-category-label" className="block text-sm font-medium text-ink">
              Категория
            </p>
            <div className="mt-1.5">
              <Select
                id="field-category"
                name="category"
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={chooseCategory}
                placeholder="Выберите категорию"
                aria-labelledby="field-category-label"
                aria-describedby={issueOf('category') ? 'field-category-error' : undefined}
                invalid={Boolean(issueOf('category'))}
                required
              />
            </div>
            {issueOf('category') ? (
              <p id="field-category-error" className="mt-1.5 text-sm font-medium text-accent">
                {issueOf('category')}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="field-city" className="block text-sm font-medium text-ink">
              Город
            </label>
            <div className="mt-1.5">
              <CityCombobox
                id="field-city"
                name="city"
                options={CITY_OPTIONS}
                groups={CITY_GROUPS}
                value={city}
                onChange={(next) => {
                  setCity(next);
                  if (next) clearIssues('city');
                }}
                placeholder="Начните вводить"
                strict
                emptyMessage={SERVICE_AREA_ERROR}
                aria-describedby={issueOf('city') ? 'field-city-error' : 'field-city-hint'}
                invalid={Boolean(issueOf('city'))}
                maxLength={JOB_LIMITS.CITY_MAX}
                required
              />
            </div>
            {issueOf('city') ? (
              <p id="field-city-error" className="mt-1.5 text-sm font-medium text-accent">
                {issueOf('city')}
              </p>
            ) : (
              <p id="field-city-hint" className="mt-1.5 text-sm text-ink-soft">
                Москва и область, Санкт-Петербург и область
              </p>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection
        step={2}
        title="Подробности"
        description={
          category
            ? `Вопросы для категории «${JOB_CATEGORY_LABELS[category]}». Чем больше ответов, тем точнее подрядчики оценят работу.`
            : undefined
        }
        id="job-questions"
      >
        <input type="hidden" name="details" value={detailsJson} />
        {category ? (
          <>
            {generalDetailsError ? <FormError message={generalDetailsError} /> : null}
            <JobQuestionnaire
              key={category}
              category={category}
              answers={answers}
              onChange={changeAnswers}
              errors={questionErrors}
            />
          </>
        ) : (
          <div className="flex items-start gap-4 rounded-2xl border border-dashed border-line bg-canvas/60 px-5 py-6">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-tint text-accent"
            >
              <svg viewBox="0 0 20 20" className="size-5">
                <path
                  d="M4 5.5h12M4 10h8M4 14.5h5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <p className="text-sm leading-relaxed text-ink-soft">
              Выберите категорию, и мы зададим несколько вопросов именно по вашей задаче: площадь,
              состояние объекта, материалы и сроки. Ответы появятся в карточке заказа.
            </p>
          </div>
        )}
      </FormSection>

      <FormSection step={3} title="Бюджет и описание">
        <fieldset>
          <legend className="text-sm font-medium text-ink">Бюджет, ₽</legend>
          <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
            <Field
              label="От"
              name="budgetMin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={13}
              defaultValue={values.budgetMin}
              onInput={() => clearIssues('budget')}
              aria-invalid={issueOf('budget') ? true : undefined}
            />
            <Field
              label="До"
              name="budgetMax"
              inputMode="numeric"
              autoComplete="off"
              maxLength={13}
              defaultValue={values.budgetMax}
              onInput={() => clearIssues('budget')}
              aria-invalid={issueOf('budget') ? true : undefined}
            />
          </div>
          {issueOf('budget') ? (
            <p className="mt-1.5 text-sm font-medium text-accent">{issueOf('budget')}</p>
          ) : (
            <p className="mt-1.5 text-sm text-ink-soft">
              Оставьте пустым, если бюджет по договорённости.
            </p>
          )}
        </fieldset>
        <div>
          <label htmlFor="field-description" className="block text-sm font-medium text-ink">
            Описание работ
          </label>
          <textarea
            id="field-description"
            name="description"
            required
            minLength={JOB_LIMITS.DESCRIPTION_MIN}
            maxLength={JOB_LIMITS.DESCRIPTION_MAX}
            rows={6}
            aria-describedby={
              issueOf('description')
                ? 'field-description-error field-description-hint'
                : 'field-description-hint'
            }
            aria-invalid={issueOf('description') ? true : undefined}
            defaultValue={values.description}
            onInput={() => clearIssues('description')}
            className={`mt-1.5 block w-full rounded-xl border bg-surface px-4 py-3 text-base leading-relaxed text-ink focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 ${
              issueOf('description') ? 'border-accent' : 'border-line'
            }`}
          />
          {issueOf('description') ? (
            <p id="field-description-error" className="mt-1.5 text-sm font-medium text-accent">
              {issueOf('description')}
            </p>
          ) : null}
          <p id="field-description-hint" className="mt-1.5 text-sm text-ink-soft">
            Всё, что не вошло в ответы выше: особенности объекта, пожелания, удобное время. Не
            указывайте телефон и адрес: контакты появятся в следующих обновлениях.
          </p>
        </div>
      </FormSection>

      <SubmitButton pending={pendingLabel}>{submitLabel}</SubmitButton>
    </form>
  );
}

function FormSection({
  step,
  title,
  description,
  id,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  id?: string;
  children: React.ReactNode;
}) {
  const headingId = `job-form-step-${step}`;
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-labelledby={headingId}
      className="scroll-mt-24 rounded-[22px] border border-line/80 bg-surface p-5 shadow-[0_1px_1px_hsl(var(--shadow-color)/0.04)] outline-none sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold tabular-nums text-surface"
        >
          {step}
        </span>
        <div>
          <h2 id={headingId} className="text-lg font-semibold leading-7 tracking-tight text-ink">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-ink-soft">{description}</p> : null}
        </div>
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}
