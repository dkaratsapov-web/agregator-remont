'use client';

import {
  isJobCategory,
  JOB_CATEGORIES,
  JOB_CATEGORY_LABELS,
  JOB_ITEM_LIMITS,
  JOB_LIMITS,
  jobDetailHighlights,
  jobDetailsProgress,
  SERVICE_AREA_ERROR,
  validateJobDetails,
  type JobCategory,
  type JobDetails,
} from '@agregator/shared';
import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { saveDraftAction, type JobFormState } from '@/app/(site)/account/jobs/actions';
import { Field } from '@/components/auth/field';
import { FormError } from '@/components/auth/form-error';
import { SubmitButton } from '@/components/auth/submit-button';
import { CityCombobox } from '@/components/ui/city-combobox';
import { CITY_GROUPS, CITY_OPTIONS } from '@/lib/city-options';
import { formatBudget } from '@/lib/format';
import { Select } from '@/components/ui/select';
import {
  checkJobForm,
  parseBudget,
  parseDetailsField,
  parseItemsField,
  readJobForm,
  type JobFormIssue,
  type JobFormValues,
} from '@/lib/job-form';
import { ProgressRuler } from '@/components/ui/progress-ruler';
import { JobQuestionnaire } from './job-questionnaire';
import { FormArgs } from '@/components/ui/form-args';
import type { FormArg } from '@/lib/form-args';

interface Props {
  action: (state: JobFormState, form: FormData) => Promise<JobFormState>;
  /** Параметры действия скрытым полем вместо bind (lib/form-args.ts). */
  args?: readonly FormArg[];
  initial?: Partial<JobFormValues>;
  submitLabel: string;
  pendingLabel: string;
  /**
   * Черновики (только для нового заказа): кнопка «Сохранить черновик» и автосохранение.
   * null — черновика ещё нет, строка — продолжаем сохранённый черновик.
   */
  draftId?: string | null;
  /** updatedAt открытого черновика: сохранение не перезапишет его правку из другой вкладки. */
  draftVersion?: string | null;
  /**
   * Ключ публикации нового заказа (UUID, выдаёт страница): повтор отправки (двойной клик,
   * обрыв связи) вернёт уже созданный заказ, а не создаст второй.
   */
  requestId?: string;
  /** Правка: updatedAt заказа на момент открытия формы. Изменён в другой вкладке → ошибка. */
  version?: string;
}

/** Пауза после последней правки перед автосохранением черновика. */
const AUTOSAVE_DELAY_MS = 4000;

type DraftStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'error'; message: string; login?: string }
  /** Черновик изменён в другой вкладке: автосохранение ждёт решения человека. */
  | { kind: 'conflict'; message: string };

interface AutosaveBox {
  timer?: number;
  /** Сохранение в пути; следующее ждёт его (again), публикация тоже. */
  inFlight: Promise<void> | null;
  again: boolean;
  /** Публикация началась: черновик больше не пишется. */
  publishing: boolean;
  /** Публикация дождалась сохранения и отправляет форму повторно. */
  publishReady: boolean;
  /** Форма на момент последней правки: нужна, когда форма уже размонтирована. */
  snapshot: FormData | null;
  mounted: boolean;
  /** id черновика из последнего ответа (раньше, чем перерисуется скрытое поле). */
  draftId: string | null;
  /** Версия черновика из последнего сохранения; null — перезаписать без проверки. */
  version: string | null;
  /** Черновик изменён в другой вкладке: не сохраняем, пока человек не выберет версию. */
  conflict: boolean;
  /** Сохранение не дошло (нет сети): повторяем, как только связь вернётся. */
  offline: boolean;
}

const timeOf = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

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
  items: 'job-positions',
};

/** Позиция другой категории в форме; key — для React, пока категория не выбрана. */
interface ExtraPosition {
  key: string;
  category: JobCategory | '';
  answers: JobDetails;
}

let positionKeys = 0;
const nextPositionKey = () => `position-${(positionKeys += 1)}`;

/** Позиции из скрытого поля (сохранённый заказ, черновик, ответ сервера с ошибкой). */
function initialExtras(raw: string | undefined): ExtraPosition[] {
  const parsed = parseItemsField(raw ?? '');
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, JOB_ITEM_LIMITS.MAX_EXTRA).map((item: unknown) => {
    const record = (typeof item === 'object' && item !== null ? item : {}) as {
      category?: unknown;
      details?: unknown;
    };
    const category = isJobCategory(record.category) ? record.category : '';
    return {
      key: nextPositionKey(),
      category,
      answers: category ? fitAnswers(category, record.details ?? {}) : {},
    };
  });
}

/** Ответы, подходящие анкете категории (скрытые и некорректные отбрасываются). */
const fitAnswers = (category: JobCategory, answers: unknown): JobDetails => {
  const result = validateJobDetails(category, answers, { lenient: true });
  return result.ok ? result.details : {};
};

export function JobForm({
  action,
  args,
  initial = {},
  submitLabel,
  pendingLabel,
  draftId: initialDraftId,
  draftVersion,
  requestId,
  version,
}: Props) {
  const [state, formAction] = useActionState<JobFormState, FormData>(action, {});
  const values = { ...initial, ...state.values };
  const drafts = initialDraftId !== undefined;
  const formRef = useRef<HTMLFormElement>(null);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>({ kind: 'idle' });
  // Ключ публикации закрепляется при первой отрисовке: перерисовка страницы его не меняет.
  const [publishKey] = useState(requestId);

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
  const [extras, setExtras] = useState<ExtraPosition[]>(() => initialExtras(values.extraItems));
  // Поля, которые штамп заказа показывает по мере ввода (сами поля не управляемые).
  const [live, setLive] = useState(() => ({
    title: values.title ?? '',
    budgetMin: values.budgetMin ?? '',
    budgetMax: values.budgetMax ?? '',
  }));
  const trackLive = (event: React.FormEvent<HTMLFormElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const name = target.name;
    if (name === 'title' || name === 'budgetMin' || name === 'budgetMax') {
      setLive((current) => ({ ...current, [name]: target.value }));
    }
  };
  const [issues, setIssues] = useState<JobFormIssue[]>(state.issues ?? []);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    setIssues(state.issues ?? []);
  }

  // Все позиции уходят в форму, даже без категории: проверка подскажет «выберите категорию».
  const extraItemsJson = JSON.stringify(
    extras.map((extra) => ({
      category: extra.category || null,
      details: extra.category ? fitAnswers(extra.category, extra.answers) : {},
    })),
  );
  const usedCategories = new Set<JobCategory>(
    [category, ...extras.map((extra) => extra.category)].filter(isJobCategory),
  );
  const positionIssues = (position: number) =>
    issues.filter((issue) => issue.field === 'items' && issue.position === position);
  const clearPositionIssues = (position: number, questionIds?: string[]) =>
    setIssues((current) =>
      current.filter(
        (issue) =>
          issue.field !== 'items' ||
          issue.position !== position ||
          (questionIds ? !questionIds.includes(issue.questionId ?? '') : false),
      ),
    );

  const addExtra = () =>
    setExtras((current) =>
      current.length >= JOB_ITEM_LIMITS.MAX_EXTRA
        ? current
        : [...current, { key: nextPositionKey(), category: '', answers: {} }],
    );
  const removeExtra = (key: string) => {
    setExtras((current) => current.filter((extra) => extra.key !== key));
    // Номера позиций сдвигаются: старые ошибки по позициям больше не на своих местах.
    setIssues((current) => current.filter((issue) => issue.field !== 'items'));
  };
  const chooseExtraCategory = (index: number, next: string) => {
    if (!isJobCategory(next)) return;
    setExtras((current) =>
      current.map((extra, i) =>
        i !== index || extra.category === next
          ? extra
          : // Общие ответы основной позиции (тип объекта, сроки) переносятся в новую анкету.
            { ...extra, category: next, answers: fitAnswers(next, category ? answers : {}) },
      ),
    );
    clearPositionIssues(index + 2);
  };
  const changeExtraAnswers = (index: number, next: JobDetails) => {
    const before = extras[index]?.answers ?? {};
    const changed = Object.keys({ ...before, ...next }).filter(
      (id) => JSON.stringify(before[id]) !== JSON.stringify(next[id]),
    );
    setExtras((current) =>
      current.map((extra, i) => (i === index ? { ...extra, answers: next } : extra)),
    );
    if (changed.length > 0) clearPositionIssues(index + 2, changed);
  };

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

  // --- черновик: сохранение по кнопке и через паузу после правок.
  // Сохранения идут строго по одному; публикация дожидается сохранения в пути и уходит с его
  // id, после начала публикации черновик больше не пишется (иначе он остался бы висеть).
  const autosave = useRef<AutosaveBox>({
    inFlight: null,
    again: false,
    publishing: false,
    publishReady: false,
    snapshot: null,
    mounted: false,
    draftId: initialDraftId ?? null,
    version: draftVersion ?? null,
    conflict: false,
    offline: false,
  });

  const saveNow = useCallback(async (): Promise<void> => {
    const box = autosave.current;
    window.clearTimeout(box.timer);
    box.timer = undefined;
    if (!drafts || box.publishing || box.conflict) return;
    if (box.inFlight) {
      box.again = true;
      return box.inFlight;
    }
    // После ухода со страницы формы уже нет: берём снимок, сделанный при последней правке.
    const form = box.mounted && formRef.current ? new FormData(formRef.current) : box.snapshot;
    box.snapshot = null;
    if (!form) return;
    // id из последнего ответа сервера: скрытое поле могло ещё не перерисоваться.
    form.set('draftId', box.draftId ?? '');
    form.set('expectedUpdatedAt', box.version ?? '');
    const run = (async () => {
      if (box.mounted) setDraftStatus({ kind: 'saving' });
      try {
        const result = await saveDraftAction(form);
        box.offline = false;
        if (result.ok) {
          box.draftId = result.draftId;
          box.version = result.savedAt;
          if (!box.mounted) return;
          setDraftId(result.draftId);
          setDraftStatus({ kind: 'saved', at: result.savedAt });
          // Адрес с ?draft=…: после перезагрузки или из истории открывается тот же черновик.
          const url = new URL(window.location.href);
          if (url.searchParams.get('draft') !== result.draftId) {
            url.searchParams.set('draft', result.draftId);
            window.history.replaceState(window.history.state, '', url);
          }
        } else {
          // Черновик опубликован или удалён в другой вкладке: следующее сохранение создаст новый.
          if (result.reset) {
            box.draftId = null;
            box.version = null;
          }
          if (result.conflict) box.conflict = true;
          if (!box.mounted) return;
          if (result.reset) setDraftId(null);
          setDraftStatus(
            result.conflict
              ? { kind: 'conflict', message: result.error }
              : { kind: 'error', message: result.error, login: result.login },
          );
        }
      } catch {
        // Запрос не дошёл до сервера: правки остаются в форме, сохранение повторится само.
        box.offline = true;
        if (box.mounted) {
          setDraftStatus({
            kind: 'error',
            message: 'Нет связи, черновик не сохранён. Сохраним, как только сеть вернётся.',
          });
        }
      }
    })();
    box.inFlight = run;
    try {
      await run;
    } finally {
      box.inFlight = null;
      const again = box.again && !box.publishing;
      box.again = false;
      if (again) void saveNow();
    }
  }, [drafts]);

  const scheduleSave = useCallback(() => {
    const box = autosave.current;
    if (!drafts || box.publishing || !formRef.current) return;
    box.snapshot = new FormData(formRef.current);
    // Конфликт версий: правки остаются в форме, сохранение ждёт выбора человека.
    if (box.conflict) return;
    window.clearTimeout(box.timer);
    box.timer = window.setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
    setDraftStatus((current) => (current.kind === 'pending' ? current : { kind: 'pending' }));
  }, [drafts, saveNow]);

  // Выбор категории, города и ответы анкеты меняют состояние, а не поля ввода: следим и за ним.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    scheduleSave();
  }, [category, city, answersByCategory, extras, scheduleSave]);

  useEffect(() => {
    if (!drafts) return;
    const box = autosave.current;
    box.mounted = true;
    const unsaved = () =>
      !box.publishing &&
      (box.timer !== undefined || box.inFlight !== null || box.conflict || box.offline);
    const retry = () => {
      if (box.offline) void saveNow();
    };
    // Вкладку прячут или закрывают: пробуем сохранить сразу. Браузер не обязан дождаться
    // ответа, поэтому при закрытии с несохранёнными правками ещё и спрашиваем подтверждение.
    const flush = () => {
      if (document.visibilityState === 'hidden' && box.timer !== undefined) void saveNow();
    };
    const warn = (event: BeforeUnloadEvent) => {
      if (!unsaved()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('beforeunload', warn);
    window.addEventListener('online', retry);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('online', retry);
      box.mounted = false;
      // Переход внутри сайта: страница жива, сохраняем последнюю правку по снимку формы.
      if (box.timer !== undefined) void saveNow();
    };
  }, [drafts, saveNow]);

  /** Конфликт черновика: сохранить версию из этой вкладки поверх другой. */
  const keepMine = () => {
    const box = autosave.current;
    box.conflict = false;
    box.version = null;
    void saveNow();
  };
  /** Конфликт черновика: открыть сохранённую версию (правки этой вкладки не сохраняются). */
  const openSaved = () => {
    const box = autosave.current;
    window.clearTimeout(box.timer);
    box.timer = undefined;
    box.conflict = false;
    window.location.reload();
  };

  // Публикация не удалась (ответ сервера с ошибкой): автосохранение снова работает.
  const [lastPublishState, setLastPublishState] = useState(state);
  if (state !== lastPublishState) {
    setLastPublishState(state);
    autosave.current.publishing = false;
    autosave.current.publishReady = false;
    // Черновик уже опубликован: следующая отправка создаст заказ заново, без его id.
    if (state.draftReset) {
      autosave.current.draftId = null;
      setDraftId(null);
    }
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const checked = checkJobForm(readJobForm(new FormData(event.currentTarget)));
    if (checked.ok) {
      const box = autosave.current;
      const form = event.currentTarget;
      // Публикуем: отложенное автосохранение больше не нужно и не должно создать черновик.
      window.clearTimeout(box.timer);
      box.timer = undefined;
      box.publishing = true;
      if (drafts && box.inFlight && !box.publishReady) {
        // Сохранение ещё в пути: ждём его и отправляем форму заново уже с id черновика.
        event.preventDefault();
        setDraftStatus({ kind: 'saving' });
        void box.inFlight.finally(() => {
          box.publishReady = true;
          form.requestSubmit();
        });
        return;
      }
      box.publishReady = false;
      // Свежий id черновика прямо в поле: состояние могло ещё не перерисоваться.
      const field = form.elements.namedItem('draftId');
      if (drafts && field instanceof HTMLInputElement) field.value = box.draftId ?? '';
      return;
    }
    event.preventDefault();
    setIssues(checked.issues);
    const first = checked.issues[0];
    const targetId =
      first.field === 'details' && first.questionId
        ? `q-${first.questionId}`
        : first.field === 'items' && first.position
          ? first.questionId
            ? `q-p${first.position}-${first.questionId}`
            : `job-position-${first.position}`
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
    // Ширина считается по контейнеру формы: на странице нового заказа она широкая (две колонки,
    // справа бюджет и кнопка), в правке на странице заказа узкая (одна колонка).
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      onInput={(event) => {
        trackLive(event);
        scheduleSave();
      }}
      noValidate
      className="@container/form"
    >
      <FormError message={topError} login={issues.length > 0 ? undefined : state.login} />
      {args ? <FormArgs values={args} /> : null}
      {drafts ? <input type="hidden" name="draftId" value={draftId ?? ''} /> : null}
      {publishKey ? <input type="hidden" name="requestId" value={publishKey} /> : null}
      {version ? <input type="hidden" name="expectedUpdatedAt" value={version} /> : null}

      <div className="grid items-start gap-5 @5xl:grid-cols-[minmax(0,1fr)_380px] @5xl:gap-6">
        <div className="min-w-0 space-y-5 @container">
          <FormSection step={1} title="Основное">
            {/* Узко: всё в столбик; средне: название на всю ширину, категория и город рядом;
                широко: всё в одну строку. */}
            <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="@lg:col-span-2 @4xl:col-span-1">
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
              </div>
              <div>
                <p id="field-category-label" className="block text-sm font-medium text-ink">
                  Категория
                </p>
                <div className="mt-1.5">
                  <Select
                    id="field-category"
                    name="category"
                    // Категории дополнительных позиций основной стать не могут.
                    options={CATEGORY_OPTIONS.filter(
                      (option) =>
                        option.value === category ||
                        !extras.some((extra) => extra.category === option.value),
                    )}
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
            <input type="hidden" name="extraItems" value={extraItemsJson} />
            {category ? (
              <>
                {generalDetailsError ? <FormError message={generalDetailsError} /> : null}
                {extras.length > 0 ? (
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
                    Позиция 1 · {JOB_CATEGORY_LABELS[category]}
                  </p>
                ) : null}
                <JobQuestionnaire
                  key={category}
                  category={category}
                  answers={answers}
                  onChange={changeAnswers}
                  errors={questionErrors}
                />
                <div id="job-positions" tabIndex={-1} className="space-y-4 pt-2 outline-none">
                  {issues
                    .filter((issue) => issue.field === 'items' && !issue.position)
                    .map((issue) => (
                      <FormError key={issue.message} message={issue.message} />
                    ))}
                  {extras.map((extra, index) => (
                    <ExtraPositionCard
                      key={extra.key}
                      position={index + 2}
                      extra={extra}
                      used={usedCategories}
                      issues={positionIssues(index + 2)}
                      onCategory={(next) => chooseExtraCategory(index, next)}
                      onAnswers={(next) => changeExtraAnswers(index, next)}
                      onRemove={() => removeExtra(extra.key)}
                    />
                  ))}
                  {extras.length < JOB_ITEM_LIMITS.MAX_EXTRA ? (
                    <button
                      type="button"
                      onClick={addExtra}
                      className="flex w-full items-center gap-3 rounded-[12px] border border-dashed border-ink/25 px-5 py-4 text-left transition-colors duration-150 hover:border-ink/50 hover:bg-canvas"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-8 shrink-0 place-items-center rounded-[7px] border-[1.5px] border-dashed border-ink/40 text-lg font-semibold text-ink"
                      >
                        +
                      </span>
                      <span>
                        <span className="block font-semibold text-ink">
                          Добавить работы другой категории
                        </span>
                        <span className="block text-sm text-ink-soft">
                          Например, к плитке сантехнику и электрику. Мастер оценит всё вместе, до{' '}
                          {JOB_ITEM_LIMITS.MAX_EXTRA + 1} категорий в заказе.
                        </span>
                      </span>
                    </button>
                  ) : null}
                </div>
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
                  Выберите категорию, и мы зададим несколько вопросов именно по вашей задаче:
                  площадь, состояние объекта, материалы и сроки. Ответы появятся в карточке заказа.
                </p>
              </div>
            )}
          </FormSection>
        </div>

        <div className="min-w-0 space-y-4 @5xl:sticky @5xl:top-24">
          <OrderStamp
            title={live.title.trim()}
            categories={[category, ...extras.map((extra) => extra.category)]
              .filter(isJobCategory)
              .map((item) => JOB_CATEGORY_LABELS[item])}
            city={city.trim()}
            highlights={category ? jobDetailHighlights(category, answers, 3) : []}
            progress={[
              ...(category ? [jobDetailsProgress(category, answers)] : []),
              ...extras.flatMap((extra) =>
                extra.category ? [jobDetailsProgress(extra.category, extra.answers)] : [],
              ),
            ].reduce(
              (sum, item) => ({
                answered: sum.answered + item.answered,
                total: sum.total + item.total,
              }),
              { answered: 0, total: 0 },
            )}
            budget={stampBudget(live.budgetMin, live.budgetMax)}
            status={drafts ? draftStatus : null}
          />
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
                rows={5}
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
          {drafts ? (
            <DraftControls
              status={draftStatus}
              onSave={() => void saveNow()}
              onKeepMine={keepMine}
              onOpenSaved={openSaved}
            />
          ) : null}
        </div>
      </div>
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
      className="scroll-mt-24 rounded-[14px] border border-line bg-surface outline-none"
    >
      {/* Лист: шапка с номером шага отделена линией, как заголовок листа в документации. */}
      <div className="flex items-start gap-3.5 border-b border-line px-5 py-4 sm:px-6">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-[7px] border-[1.5px] border-ink font-display text-[13px] font-semibold tabular-nums text-ink"
        >
          {step}
        </span>
        <div className="pt-0.5">
          <h2 id={headingId} className="text-lg font-semibold leading-7 tracking-tight text-ink">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 max-w-[60ch] text-sm text-ink-soft">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="space-y-4 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

/** Текст состояния черновика: в штампе заказа. */
function draftStatusText(status: DraftStatus): string {
  return status.kind === 'saving'
    ? 'Сохраняем черновик…'
    : status.kind === 'pending'
      ? 'Есть несохранённые изменения'
      : status.kind === 'saved'
        ? `Черновик сохранён в ${timeOf(status.at)}`
        : status.kind === 'error' || status.kind === 'conflict'
          ? status.message
          : 'Черновик сохраняется сам через несколько секунд после правки';
}

const draftLinkClass =
  'font-semibold text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent';

function DraftControls({
  status,
  onSave,
  onKeepMine,
  onOpenSaved,
}: {
  status: DraftStatus;
  onSave: () => void;
  onKeepMine: () => void;
  onOpenSaved: () => void;
}) {
  if (status.kind === 'conflict') {
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border border-accent/40 bg-accent-tint px-4 py-3 text-sm text-ink"
      >
        <p>
          {status.message} Оставьте версию из этой вкладки или откройте сохранённую (правки этой
          вкладки тогда пропадут).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onKeepMine}
            className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 font-semibold text-canvas transition-transform duration-150 active:scale-[0.98]"
          >
            Оставить мою версию
          </button>
          <button
            type="button"
            onClick={onOpenSaved}
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 font-semibold text-ink transition-[border-color,transform] duration-150 hover:border-ink/25 active:scale-[0.98]"
          >
            Открыть сохранённую
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {status.kind === 'error' && status.login ? (
        <p role="alert" className="text-center text-sm text-ink">
          <a href={status.login} target="_blank" rel="noopener" className={draftLinkClass}>
            Войти в новой вкладке
          </a>
          , затем нажмите «Сохранить черновик».
        </p>
      ) : null}
      <button
        type="button"
        onClick={onSave}
        disabled={status.kind === 'saving'}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-ink transition-[border-color,background-color,transform] duration-150 hover:border-ink/25 active:scale-[0.98] disabled:opacity-60"
      >
        Сохранить черновик
      </button>
      <p className="text-center text-sm text-ink-soft">
        Продолжить черновик можно из «Мои заказы».
      </p>
    </div>
  );
}

const stampBudget = (minRaw: string, maxRaw: string): string => {
  const min = parseBudget(minRaw);
  const max = parseBudget(maxRaw);
  if (min === 'invalid' || max === 'invalid') return 'Проверьте сумму';
  return formatBudget(min, max, 'RUB');
};

/**
 * Штамп заказа — как основная надпись на строительном чертеже: сводка того, что уже
 * заполнено, обновляется по мере ввода. Толстая внешняя рамка, тонкие внутренние линии.
 */
function OrderStamp({
  title,
  categories,
  city,
  highlights,
  progress,
  budget,
  status,
}: {
  title: string;
  categories: string[];
  city: string;
  highlights: string[];
  progress: { answered: number; total: number };
  budget: string;
  status: DraftStatus | null;
}) {
  const empty = <span className="font-normal text-ink-soft">не указано</span>;
  const rows: [string, React.ReactNode][] = [
    [categories.length > 1 ? 'Категории' : 'Категория', categories.join(', ') || empty],
    ['Город', city || empty],
    // То же, что увидят подрядчики на карточке заказа в каталоге.
    [
      'На карточке',
      highlights.join(', ') || <span className="font-normal text-ink-soft">по ответам анкеты</span>,
    ],
    ['Бюджет', budget],
  ];
  return (
    <section
      aria-label="Сводка заказа"
      className="overflow-hidden rounded-[6px] border-[1.5px] border-ink bg-surface text-sm"
    >
      <div className="border-b border-ink/20 px-4 py-3">
        <p className="text-xs text-ink-soft">Заказ</p>
        <p className="mt-0.5 font-display text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
          {title || <span className="text-ink-soft/70">Без названия</span>}
        </p>
      </div>
      <dl className="grid grid-cols-[7.25rem_minmax(0,1fr)]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="border-b border-r border-ink/15 px-4 py-2.5 text-xs leading-5 text-ink-soft">
              {label}
            </dt>
            <dd className="border-b border-ink/15 px-3 py-2.5 font-medium leading-5 text-ink [overflow-wrap:anywhere]">
              {value}
            </dd>
          </div>
        ))}
        <dt className="border-b border-r border-ink/15 px-4 py-2.5 text-xs leading-5 text-ink-soft">
          Анкета
        </dt>
        <dd className="border-b border-ink/15 px-3 py-2.5">
          <span className="flex items-baseline justify-between gap-2 font-medium leading-5 text-ink">
            <span className="tabular-nums">
              {progress.answered} из {progress.total}
            </span>
            <span className="text-xs font-normal text-ink-soft">
              <span aria-hidden="true" className="text-accent">
                *{' '}
              </span>
              обязательные
            </span>
          </span>
          <ProgressRuler answered={progress.answered} total={progress.total} className="mt-2" />
        </dd>
      </dl>
      <div className="grid grid-cols-[minmax(0,1fr)_auto]">
        <p
          role="status"
          aria-live="polite"
          className={`border-r border-ink/15 px-4 py-2.5 text-xs leading-5 ${
            status?.kind === 'error' || status?.kind === 'conflict'
              ? 'font-medium text-accent'
              : 'text-ink-soft'
          }`}
        >
          {status ? draftStatusText(status) : 'Изменения сохранятся после «Сохранить изменения»'}
        </p>
        <p className="px-3 py-2.5 font-display text-[11px] font-semibold leading-5 tracking-[-0.01em] text-ink">
          Гарантыч
        </p>
      </div>
    </section>
  );
}

function ExtraPositionCard({
  position,
  extra,
  used,
  issues,
  onCategory,
  onAnswers,
  onRemove,
}: {
  position: number;
  extra: ExtraPosition;
  used: Set<JobCategory>;
  issues: JobFormIssue[];
  onCategory: (next: string) => void;
  onAnswers: (next: JobDetails) => void;
  onRemove: () => void;
}) {
  const labelId = `job-position-${position}-label`;
  const categoryError = issues.find((issue) => !issue.questionId)?.message;
  const questionErrors: Record<string, string> = {};
  for (const issue of issues) {
    if (issue.questionId) questionErrors[issue.questionId] ??= issue.message;
  }
  // Категории, уже выбранные в заказе, не предлагаются (кроме своей).
  const options = CATEGORY_OPTIONS.filter(
    (option) => option.value === extra.category || !used.has(option.value),
  );
  return (
    <section
      id={`job-position-${position}`}
      tabIndex={-1}
      aria-labelledby={labelId}
      className="rounded-[12px] border border-line bg-canvas/60 p-4 outline-none sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id={labelId} className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
          Позиция {position}
          {extra.category ? ` · ${JOB_CATEGORY_LABELS[extra.category]}` : ''}
        </h3>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-ink-soft transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
        >
          Убрать
        </button>
      </div>
      <div className="mt-3 max-w-sm">
        <p id={`${labelId}-category`} className="block text-sm font-medium text-ink">
          Категория
        </p>
        <div className="mt-1.5">
          <Select
            id={`job-position-${position}-category`}
            options={options}
            value={extra.category}
            onChange={onCategory}
            placeholder="Выберите категорию"
            aria-labelledby={`${labelId}-category`}
            invalid={Boolean(categoryError)}
          />
        </div>
        {categoryError ? (
          <p className="mt-1.5 text-sm font-medium text-accent">{categoryError}</p>
        ) : null}
      </div>
      {extra.category ? (
        <div className="mt-2">
          <JobQuestionnaire
            key={extra.category}
            category={extra.category}
            answers={extra.answers}
            onChange={onAnswers}
            errors={questionErrors}
            idPrefix={`p${position}-`}
            stickyProgress={false}
          />
        </div>
      ) : null}
    </section>
  );
}
