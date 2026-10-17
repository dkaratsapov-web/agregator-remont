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
import { CheckIcon, Select } from '@/components/ui/select';

interface Props {
  category: JobCategory;
  answers: JobDetails;
  onChange: (answers: JobDetails) => void;
  /** Ошибки по id вопроса. */
  errors?: Record<string, string>;
}

/**
 * Анкета категории: вопросы по разделам, вложенные ветки раскрываются по ответам.
 * Ответы хранит родитель; в форму они уходят скрытым полем (см. JobForm).
 */
export function JobQuestionnaire({ category, answers, onChange, errors = {} }: Props) {
  const questionnaire = JOB_QUESTIONNAIRES[category];
  const visible = visibleJobQuestionIds(category, answers);
  const progress = jobDetailsProgress(category, answers);
  const percent = progress.total === 0 ? 0 : Math.round((progress.answered / progress.total) * 100);

  const setAnswer = (id: string, value: JobAnswer | undefined) => {
    const next = { ...answers };
    if (value === undefined) delete next[id];
    else next[id] = value;
    onChange(next);
  };

  const renderQuestions = (questions: readonly JobQuestion[], depth: number) =>
    questions.map((question) => (
      <Reveal key={question.id} open={visible.has(question.id)}>
        <QuestionBlock
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
      <div className="sticky top-16 z-20 -mx-5 border-b border-line/70 bg-surface/95 px-5 py-3 backdrop-blur-md sm:-mx-7 sm:px-7">
        <div className="flex items-center justify-between gap-4 text-sm">
          <p className="font-medium text-ink" aria-live="polite">
            Заполнено{' '}
            <span className="tabular-nums">
              {progress.answered} из {progress.total}
            </span>
          </p>
          <p className="text-ink-soft tabular-nums">{percent}%</p>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted-tint"
          role="progressbar"
          aria-label="Заполнение анкеты"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.answered}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-out)] motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="mt-2">
        {questionnaire.sections.map((section) => (
          <section key={section.id} aria-labelledby={`qs-${section.id}`} className="pt-6">
            <h3
              id={`qs-${section.id}`}
              className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft"
            >
              {section.title}
            </h3>
            <div className="mt-1">{renderQuestions(section.questions, 0)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Плавное раскрытие ветки (высота и прозрачность); без анимации при prefers-reduced-motion. */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
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
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
      inert={!open}
      aria-hidden={!open || undefined}
    >
      <div className={`min-h-0 ${open && settled ? '' : 'overflow-hidden'}`}>{children}</div>
    </div>
  );
}

interface BlockProps {
  question: JobQuestion;
  depth: number;
  value: JobAnswer | undefined;
  error?: string;
  onChange: (value: JobAnswer | undefined) => void;
  children?: React.ReactNode;
}

function QuestionBlock({ question, depth, value, error, onChange, children }: BlockProps) {
  const labelId = `q-${question.id}-label`;
  const hintId = question.hint ? `q-${question.id}-hint` : undefined;
  const errorId = error ? `q-${question.id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const nested = depth > 0;

  return (
    <div className="pt-5">
      <div
        id={`q-${question.id}`}
        tabIndex={-1}
        className={`scroll-mt-40 outline-none ${
          nested ? 'border-l-2 border-accent/25 pl-4 sm:pl-5' : ''
        }`}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p
            id={labelId}
            className={`font-medium text-ink ${nested ? 'text-[15px]' : 'text-base'}`}
          >
            {question.label}
          </p>
          {question.required ? (
            <span className="rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold text-accent">
              обязательно
            </span>
          ) : null}
        </div>
        {question.hint ? (
          <p id={hintId} className="mt-0.5 text-sm text-ink-soft">
            {question.hint}
          </p>
        ) : null}
        <div className="mt-3">
          <QuestionControl
            question={question}
            value={value}
            onChange={onChange}
            labelId={labelId}
            describedBy={describedBy}
            invalid={Boolean(error)}
          />
        </div>
        {error ? (
          <p id={errorId} className="mt-2 text-sm font-medium text-accent">
            {error}
          </p>
        ) : null}
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

const chipBase =
  'inline-flex min-h-11 select-none items-center gap-2 rounded-full border px-4 py-2 text-left text-[15px] leading-snug transition-[background-color,border-color,color,transform,box-shadow] duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2';
const chipOff = 'border-line bg-surface text-ink hover:border-ink-soft/40 hover:bg-canvas';
const chipOn =
  'border-accent bg-accent-tint font-medium text-ink shadow-[inset_0_0_0_1px_var(--accent)]';

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
              className={`grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-150 ${
                on ? 'border-accent bg-accent' : 'border-ink-soft/40 bg-surface'
              }`}
            >
              <span className={`size-1.5 rounded-full bg-surface ${on ? '' : 'opacity-0'}`} />
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
              className={`grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors duration-150 ${
                on ? 'border-accent bg-accent text-accent-ink' : 'border-ink-soft/40 bg-surface'
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
            className="w-[4.5rem] bg-transparent py-2 text-center text-lg font-semibold tabular-nums text-ink placeholder:font-normal placeholder:text-ink-soft/50 focus:outline-none"
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
      className={`block min-h-12 w-full max-w-xl rounded-xl border bg-surface px-4 text-base text-ink placeholder:text-ink-soft/70 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 ${
        invalid ? 'border-accent' : 'border-line'
      }`}
    />
  );
}
