'use client';

import {
  JOB_QUESTIONNAIRES,
  formatJobNumber,
  jobDetailsProgress,
  visibleJobQuestionIds,
  type BooleanQuestion,
  type JobAnswer,
  type JobCategory,
  type JobDetails,
  type JobQuestion,
  type MultiQuestion,
  type NumberQuestion,
  type SingleQuestion,
  type TextQuestion,
} from '@agregator/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { ProgressRuler } from '@/components/ui/progress-ruler';
import { CheckIcon, Select } from '@/components/ui/select';

interface Props {
  category: JobCategory;
  answers: JobDetails;
  onChange: (answers: JobDetails) => void;
  /** Ошибки по id вопроса. */
  errors?: Record<string, string>;
  /**
   * Приставка к id элементов: в заказе с несколькими позициями анкеты разных категорий стоят
   * на одной странице, и одинаковые вопросы («Тип объекта») не должны совпадать по id.
   */
  idPrefix?: string;
  /** Полоса «Заполнено» прилипает к шапке; в карточке позиции — обычная строка. */
  stickyProgress?: boolean;
}

/**
 * Анкета категории: вопросы по разделам, вложенные ветки раскрываются по ответам.
 * Ответы хранит родитель; в форму они уходят скрытым полем (см. JobForm).
 */
export function JobQuestionnaire({
  category,
  answers,
  onChange,
  errors = {},
  idPrefix = '',
  stickyProgress = true,
}: Props) {
  const questionnaire = JOB_QUESTIONNAIRES[category];
  const visible = visibleJobQuestionIds(category, answers);
  const progress = jobDetailsProgress(category, answers);

  const setAnswer = (id: string, value: JobAnswer | undefined) => {
    const next = { ...answers };
    if (value === undefined) delete next[id];
    else next[id] = value;
    onChange(next);
  };

  const renderQuestions = (questions: readonly JobQuestion[], depth: number) =>
    questions.map((question) => (
      <Reveal
        key={question.id}
        open={visible.has(question.id)}
        // Строки ведомости разделены линией; у скрытой строки линии нет.
        className={
          depth === 0 && visible.has(question.id) ? 'border-t border-line/80 first:border-t-0' : ''
        }
      >
        <QuestionBlock
          idPrefix={idPrefix}
          question={question}
          depth={depth}
          value={answers[question.id]}
          error={errors[question.id]}
          onChange={(value) => setAnswer(question.id, value)}
        >
          {question.followUps ? renderQuestions(question.followUps, depth + 1) : null}
        </QuestionBlock>
      </Reveal>
    ));

  return (
    <div>
      {/* На широкой форме заполненность показывает штамп заказа справа. */}
      <div
        className={
          stickyProgress
            ? 'sticky top-16 z-20 -mx-5 border-b border-line bg-surface/95 px-5 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 @5xl/form:hidden'
            : 'pt-1'
        }
      >
        <div className="flex items-center justify-between gap-4 text-sm">
          <p className="font-medium text-ink" aria-live="polite">
            Заполнено{' '}
            <span className="tabular-nums">
              {progress.answered} из {progress.total}
            </span>
          </p>
          <p className="text-ink-soft">
            <span aria-hidden="true" className="text-accent">
              *{' '}
            </span>
            обязательные вопросы
          </p>
        </div>
        <ProgressRuler answered={progress.answered} total={progress.total} className="mt-2" />
      </div>

      <div className="@container">
        {questionnaire.sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`qs-${idPrefix}${section.id}`}
            className="pt-7"
          >
            <h3
              id={`qs-${idPrefix}${section.id}`}
              className="flex items-center gap-3 text-[15px] font-semibold text-ink"
            >
              {section.title}
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
            </h3>
            {/* Ведомость: вопрос слева, ответы справа; строки разделены линиями. */}
            <div className="mt-1">{renderQuestions(section.questions, 0)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Плавное раскрытие ветки (высота и прозрачность); без анимации при prefers-reduced-motion. */
function Reveal({
  open,
  className = '',
  children,
}: {
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  // После раскрытия снимаем overflow-hidden, чтобы выпадающие списки внутри не обрезались.
  const [settled, setSettled] = useState(open);
  useEffect(() => {
    if (!open) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), 320);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div
      className={`grid min-w-0 transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      } ${className}`}
      inert={!open}
      aria-hidden={!open || undefined}
    >
      <div className={`min-h-0 ${open && settled ? '' : 'overflow-hidden'}`}>{children}</div>
    </div>
  );
}

interface BlockProps {
  idPrefix: string;
  question: JobQuestion;
  depth: number;
  value: JobAnswer | undefined;
  error?: string;
  onChange: (value: JobAnswer | undefined) => void;
  children?: React.ReactNode;
}

function QuestionBlock({
  idPrefix,
  question,
  depth,
  value,
  error,
  onChange,
  children,
}: BlockProps) {
  const base = `q-${idPrefix}${question.id}`;
  const labelId = `${base}-label`;
  const hintId = question.hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const nested = depth > 0;

  const label = (
    <div>
      <p
        id={labelId}
        className={`font-medium leading-snug text-ink ${nested ? 'text-[15px]' : 'text-base'}`}
      >
        {question.label}
        {question.required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-accent">
              *
            </span>
            <span className="sr-only"> (обязательно)</span>
          </>
        ) : null}
      </p>
      {question.hint ? (
        <p id={hintId} className="mt-1 text-sm leading-snug text-ink-soft">
          {question.hint}
        </p>
      ) : null}
    </div>
  );
  const control = (
    <>
      <QuestionControl
        question={question}
        value={value}
        onChange={onChange}
        labelId={labelId}
        describedBy={describedBy}
        invalid={Boolean(error)}
      />
      {error ? (
        <p id={errorId} className="mt-2 text-sm font-medium text-accent">
          {error}
        </p>
      ) : null}
    </>
  );

  // Вложенный вопрос — под ответом родителя, с линией ветки; верхний — строка ведомости.
  if (nested) {
    return (
      <div className="pt-4">
        <div
          id={base}
          tabIndex={-1}
          className="scroll-mt-40 border-l-2 border-accent/30 pl-4 outline-none sm:pl-5"
        >
          {label}
          <div className="mt-2.5">{control}</div>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      id={base}
      tabIndex={-1}
      className="grid scroll-mt-40 gap-x-8 gap-y-3 py-5 outline-none @2xl:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)]"
    >
      <div className="@2xl:pt-2.5">{label}</div>
      <div className="min-w-0">
        {control}
        {children}
      </div>
    </div>
  );
}

interface ControlProps<Q extends JobQuestion> {
  question: Q;
  value: JobAnswer | undefined;
  onChange: (value: JobAnswer | undefined) => void;
  labelId: string;
  describedBy?: string;
  invalid: boolean;
}

function QuestionControl(props: ControlProps<JobQuestion>) {
  const { question } = props;
  switch (question.type) {
    case 'single':
      return question.display === 'select' ? (
        <SelectControl {...props} question={question} />
      ) : (
        <ChoiceChips
          {...props}
          options={question.options}
          selected={typeof props.value === 'string' ? props.value : undefined}
          onSelect={(value) => props.onChange(value)}
        />
      );
    case 'multi':
      return <MultiChips {...props} question={question} />;
    case 'boolean':
      return <BooleanChips {...props} question={question} />;
    case 'number':
      return <NumberStepper {...props} question={question} />;
    case 'text':
      return <TextControl {...props} question={question} />;
  }
}

// Варианты ответа — «образцы»: плитки с небольшим скруглением; выбранная заливается тёмным.
const chipBase =
  'inline-flex min-h-11 select-none items-center gap-2.5 rounded-[10px] border px-3.5 py-2 text-left text-[15px] leading-snug transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2';
const chipOff = 'border-line bg-surface text-ink hover:border-ink/35';
const chipOn = 'border-ink bg-ink font-medium text-canvas';

/** Один вариант из нескольких: radiogroup с переходом стрелками; повторный клик снимает выбор. */
function ChoiceChips({
  options,
  selected,
  onSelect,
  labelId,
  describedBy,
  invalid,
}: {
  options: readonly { value: string; label: string }[];
  selected: string | undefined;
  onSelect: (value: string | undefined) => void;
  labelId: string;
  describedBy?: string;
  invalid: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === selected);
  const focusIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    let next = -1;
    if (delta !== 0) next = (index + delta + options.length) % options.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = options.length - 1;
    if (next === -1) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onSelect(options[next].value);
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex flex-wrap gap-2"
    >
      {options.map((option, index) => {
        const on = option.value === selected;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={index === focusIndex ? 0 : -1}
            onClick={() => onSelect(on ? undefined : option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`${chipBase} ${on ? chipOn : chipOff} ${invalid && !on ? 'border-accent/60' : ''}`}
          >
            <span
              aria-hidden="true"
              className={`grid size-3.5 shrink-0 place-items-center rounded-full border transition-colors duration-150 ${
                on ? 'border-accent bg-accent' : 'border-ink/30'
              }`}
            >
              <span className={`size-1 rounded-full bg-canvas ${on ? '' : 'opacity-0'}`} />
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function BooleanChips({ question, value, onChange, ...rest }: ControlProps<BooleanQuestion>) {
  const options = [
    { value: 'yes', label: question.yesLabel ?? 'Да' },
    { value: 'no', label: question.noLabel ?? 'Нет' },
  ];
  return (
    <ChoiceChips
      {...rest}
      options={options}
      selected={value === true ? 'yes' : value === false ? 'no' : undefined}
      onSelect={(next) => onChange(next === undefined ? undefined : next === 'yes')}
    />
  );
}

function MultiChips({
  question,
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
}: ControlProps<MultiQuestion>) {
  const chosen = Array.isArray(value) ? value : [];
  const limitReached = question.maxSelected !== undefined && chosen.length >= question.maxSelected;
  const toggle = (option: string) => {
    const next = chosen.includes(option)
      ? chosen.filter((item) => item !== option)
      : [...chosen, option];
    // Порядок как в анкете, чтобы ответы выглядели одинаково.
    const ordered = question.options.map((o) => o.value).filter((v) => next.includes(v));
    onChange(ordered.length === 0 ? undefined : ordered);
  };
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex flex-wrap gap-2"
    >
      {question.options.map((option) => {
        const on = chosen.includes(option.value);
        const blocked = !on && limitReached;
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-disabled={blocked || undefined}
            onClick={() => !blocked && toggle(option.value)}
            className={`${chipBase} ${on ? chipOn : chipOff} ${
              blocked ? 'cursor-not-allowed opacity-50 active:scale-100' : ''
            } ${invalid && !on ? 'border-accent/60' : ''}`}
          >
            <span
              aria-hidden="true"
              className={`grid size-3.5 shrink-0 place-items-center rounded-[4px] border transition-colors duration-150 ${
                on ? 'border-accent bg-accent text-accent-ink' : 'border-ink/30'
              }`}
            >
              {on ? <CheckIcon className="size-3 text-accent-ink" /> : null}
            </span>
            {option.label}
          </button>
        );
      })}
      {question.maxSelected !== undefined ? (
        <p className="basis-full text-sm text-ink-soft tabular-nums">
          Выбрано {chosen.length} из {question.maxSelected}
        </p>
      ) : null}
    </div>
  );
}

function SelectControl({
  question,
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
}: ControlProps<SingleQuestion>) {
  return (
    <div className="max-w-sm">
      <Select
        options={question.options}
        value={typeof value === 'string' ? value : ''}
        onChange={(next) => onChange(next === '' ? undefined : next)}
        placeholder="Выберите вариант"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        invalid={invalid}
        required={question.required}
      />
    </div>
  );
}

/** Текст числа для поля ввода: 2.7 → «2,7». */
const toText = (value: JobAnswer | undefined) =>
  typeof value === 'number' ? String(value).replace('.', ',') : '';

function parseNumber(text: string): number | null {
  const compact = text.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(compact)) return null;
  return Number(compact);
}

function decimalsOf(step: number): number {
  const [, frac = ''] = String(step).split('.');
  return frac.length;
}

function NumberStepper({
  question,
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
}: ControlProps<NumberQuestion>) {
  const inputId = useId();
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);
  // Значение сменилось снаружи (например, сброс при смене категории).
  if (value !== lastValue) {
    setLastValue(value);
    if (parseNumber(text) !== value) setText(toText(value));
  }

  const step = question.step ?? 1;
  const parsed = parseNumber(text);
  const outOfRange = parsed !== null && (parsed < question.min || parsed > question.max);
  const malformed = text.trim() !== '' && parsed === null;
  const localError = malformed
    ? 'Введите число'
    : outOfRange
      ? `От ${formatJobNumber(question.min)} до ${formatJobNumber(question.max)} ${question.unit}`
      : null;

  const commit = (nextText: string) => {
    setText(nextText);
    const number = parseNumber(nextText);
    const ok =
      number !== null &&
      number >= question.min &&
      number <= question.max &&
      Math.abs(Math.round(number / step) * step - number) < 1e-9;
    const next = ok ? number : undefined;
    setLastValue(next);
    onChange(next);
  };

  const bump = (direction: 1 | -1) => {
    const base = parsed ?? (direction === 1 ? question.min - step : question.min);
    const raw = Math.round((base + direction * step) / step) * step;
    const clamped = Math.min(question.max, Math.max(question.min, raw));
    commit(toText(Number(clamped.toFixed(decimalsOf(step)))));
  };

  const errorId = localError ? `${inputId}-error` : undefined;
  const button =
    'grid size-11 shrink-0 place-items-center rounded-xl text-ink-soft transition-[background-color,color,transform] duration-150 hover:bg-muted-tint hover:text-ink active:scale-95 disabled:opacity-40 disabled:hover:bg-transparent motion-reduce:transition-none';

  return (
    <div>
      <div
        className={`inline-flex items-center gap-1 rounded-2xl border bg-surface p-1 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-tint)] ${
          invalid || localError ? 'border-accent' : 'border-line'
        }`}
      >
        <button
          type="button"
          className={button}
          aria-label={`Уменьшить: ${question.label}`}
          disabled={parsed !== null && parsed <= question.min}
          onClick={() => bump(-1)}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
            <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
        <label htmlFor={inputId} className="flex items-baseline gap-1.5 px-1">
          <input
            id={inputId}
            type="text"
            inputMode={step < 1 ? 'decimal' : 'numeric'}
            autoComplete="off"
            aria-labelledby={labelId}
            aria-describedby={[describedBy, errorId].filter(Boolean).join(' ') || undefined}
            aria-invalid={invalid || Boolean(localError) || undefined}
            placeholder={question.placeholder ?? ''}
            maxLength={9}
            value={text}
            onChange={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                bump(event.key === 'ArrowUp' ? 1 : -1);
              }
            }}
            className="w-[4.5rem] bg-transparent py-2 text-center text-lg font-semibold tabular-nums text-ink placeholder:font-normal placeholder:text-ink-soft focus:outline-none"
          />
          <span className="text-sm text-ink-soft">{question.unit}</span>
        </label>
        <button
          type="button"
          className={button}
          aria-label={`Увеличить: ${question.label}`}
          disabled={parsed !== null && parsed >= question.max}
          onClick={() => bump(1)}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
            <path
              d="M8 3.5v9M3.5 8h9"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {localError ? (
        <p id={errorId} className="mt-1.5 text-sm text-accent">
          {localError}
        </p>
      ) : null}
    </div>
  );
}

function TextControl({
  question,
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
}: ControlProps<TextQuestion>) {
  return (
    <input
      type="text"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      autoComplete="off"
      maxLength={question.maxLength ?? 200}
      placeholder={question.placeholder}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      className={`block min-h-12 w-full max-w-xl rounded-xl border bg-surface px-4 text-base text-ink placeholder:text-ink-soft focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 ${
        invalid ? 'border-accent' : 'border-line'
      }`}
    />
  );
}
