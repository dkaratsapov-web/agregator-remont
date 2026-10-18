'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  filterOptions,
  findOptionByLabel,
  groupItems,
  moveActiveIndex,
  splitHighlight,
  type ListGroup,
  type ListOption,
} from '@/lib/listbox';
import { CheckIcon } from './select';

export interface CityComboboxProps {
  /** Имя поля формы: значение уходит в скрытый input (работает в Server Action форме). */
  name?: string;
  options: readonly ListOption[];
  groups?: readonly ListGroup[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  id?: string;
  'aria-describedby'?: string;
  required?: boolean;
  invalid?: boolean;
  /**
   * Строгий режим: значением может быть только вариант из списка. Набранный текст без
   * совпадения даёт пустое значение и сообщение `emptyMessage`. Иначе разрешён любой текст.
   */
  strict?: boolean;
  /** Что показать, если по запросу ничего не нашлось. */
  emptyMessage?: string;
  maxLength?: number;
  autoFocus?: boolean;
}

/**
 * Поле с подсказками (паттерн WAI-ARIA «combobox with listbox popup», aria-autocomplete="list").
 * Поиск без учёта регистра и ё/е, совпадение подсвечивается, варианты группируются.
 * Клавиатура: стрелки, PageUp/PageDown, Enter, Escape, Alt+стрелка вниз.
 */
export function CityCombobox({
  name,
  options,
  groups,
  value: controlled,
  defaultValue = '',
  onChange,
  placeholder,
  id,
  'aria-describedby': describedBy,
  required,
  invalid,
  strict = false,
  emptyMessage = 'Ничего не нашлось',
  maxLength = 100,
  autoFocus,
}: CityComboboxProps) {
  const autoId = useId();
  const inputId = id ?? `combobox-${autoId}`;
  const listId = `${inputId}-list`;
  const outsideId = `${inputId}-outside`;
  const labelOf = (value: string) =>
    options.find((option) => option.value === value)?.label ?? (strict ? '' : value);

  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = controlled ?? uncontrolled;
  const [text, setText] = useState(() => labelOf(value) || (strict ? defaultValue : value));
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [touched, setTouched] = useState(false);
  const [lastValue, setLastValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Значение сменили снаружи (controlled): показываем его название.
  if (value !== lastValue) {
    setLastValue(value);
    setText(labelOf(value));
  }

  const matches = filterOptions(options, query);
  const outside = strict && touched && !open && text.trim() !== '' && value === '';

  const setValue = (next: string) => {
    if (next === value) return;
    if (controlled === undefined) setUncontrolled(next);
    setLastValue(next);
    onChange?.(next);
  };

  const choose = (option: ListOption) => {
    setText(option.label);
    setQuery('');
    setValue(option.value);
    setOpen(false);
    setTouched(true);
  };

  const openList = (fromQuery = query) => {
    const list = filterOptions(options, fromQuery);
    const selected = list.findIndex((item) => item.option.value === value);
    setActive(
      selected >= 0
        ? selected
        : fromQuery
          ? moveActiveIndex(
              list.map((i) => i.option),
              -1,
              'first',
            )
          : -1,
    );
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || active < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onInput = (next: string) => {
    setText(next);
    setQuery(next);
    const exact = findOptionByLabel(options, next);
    setValue(strict ? (exact?.value ?? '') : next.trim() === '' ? '' : (exact?.value ?? next));
    const list = filterOptions(options, next);
    setActive(
      next.trim() === ''
        ? -1
        : moveActiveIndex(
            list.map((i) => i.option),
            -1,
            'first',
          ),
    );
    setOpen(true);
  };

  const onBlur = () => {
    setOpen(false);
    setTouched(true);
    setQuery('');
    const exact = findOptionByLabel(options, text);
    if (exact) {
      setText(exact.label);
      setValue(exact.value);
    } else if (!strict) {
      setText(text.trim());
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const list = matches.map((item) => item.option);
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'PageDown':
      case 'PageUp': {
        event.preventDefault();
        if (!open) {
          openList();
          return;
        }
        const move = {
          ArrowDown: 'next',
          ArrowUp: 'prev',
          PageDown: 'pageDown',
          PageUp: 'pageUp',
        } as const;
        setActive((current) =>
          moveActiveIndex(list, current, move[event.key as keyof typeof move]),
        );
        return;
      }
      case 'Enter':
        if (open && active >= 0 && list[active]) {
          event.preventDefault();
          choose(list[active]);
        } else if (open) {
          event.preventDefault();
          setOpen(false);
        }
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
        } else if (text !== '') {
          event.preventDefault();
          onInput('');
          setOpen(false);
        }
        return;
    }
  };

  const sections = groupItems(
    matches.map((item, index) => ({ ...item, index })),
    groups,
  );
  const optionId = (index: number) => `${listId}-${index}`;
  const describedByIds = [describedBy, outside ? outsideId : null].filter(Boolean).join(' ');

  return (
    <div className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-describedby={describedByIds || undefined}
          aria-required={required || undefined}
          aria-invalid={invalid || outside || undefined}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={maxLength}
          placeholder={placeholder}
          value={text}
          onChange={(event) => onInput(event.target.value)}
          onFocus={() => openList('')}
          onClick={() => !open && openList('')}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={`block min-h-12 w-full rounded-xl border bg-surface pl-11 pr-11 text-base text-ink placeholder:text-ink-soft/70 transition-[border-color,box-shadow] duration-150 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 ${
            invalid || outside ? 'border-accent' : 'border-line hover:border-ink-soft/40'
          } ${open ? 'border-accent' : ''}`}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-soft"
        >
          <path
            d="M10 17.5s5.5-4.6 5.5-9.25a5.5 5.5 0 1 0-11 0C4.5 12.9 10 17.5 10 17.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="10" cy="8.25" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        {text !== '' ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Очистить"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onInput('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-ink-soft hover:bg-muted-tint hover:text-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
              <path
                d="m4.5 4.5 7 7m0-7-7 7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Подсказки"
        hidden={!open}
        onMouseDown={(event) => event.preventDefault()}
        className="absolute inset-x-0 top-full z-40 mt-2 max-h-[min(22rem,60vh)] origin-top overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_44px_-18px_hsl(var(--shadow-color)/0.45),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none starting:-translate-y-1 starting:opacity-0"
      >
        {matches.length === 0 ? (
          <li
            role="presentation"
            className="flex gap-3 px-3 py-3 text-sm leading-relaxed text-ink-soft"
          >
            <span aria-hidden="true" className="mt-0.5 size-2 shrink-0 rounded-full bg-accent" />
            <span role="status">{emptyMessage}</span>
          </li>
        ) : (
          sections.map((section) => (
            <ComboboxSection key={section.group?.id ?? '_'} label={section.group?.label}>
              {section.items.map(({ option, match, index }) => {
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={optionId(index)}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onPointerMove={() => setActive(index)}
                    onClick={() => choose(option)}
                    className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-[15px] text-ink ${
                      index === active ? 'bg-muted-tint' : ''
                    } ${isSelected ? 'font-semibold' : ''}`}
                  >
                    <span>
                      {splitHighlight(option.label, match).map((part, i) =>
                        part.hit ? (
                          <mark
                            key={i}
                            className="rounded-[4px] bg-accent-tint font-semibold text-accent-hover"
                          >
                            {part.text}
                          </mark>
                        ) : (
                          <span key={i}>{part.text}</span>
                        ),
                      )}
                    </span>
                    {isSelected ? <CheckIcon /> : null}
                  </li>
                );
              })}
            </ComboboxSection>
          ))
        )}
      </ul>
      {outside ? (
        <p id={outsideId} className="mt-1.5 text-sm text-accent">
          {emptyMessage}
        </p>
      ) : null}
    </div>
  );
}

function ComboboxSection({ label, children }: { label?: string; children: React.ReactNode }) {
  const headingId = useId();
  if (!label) return <>{children}</>;
  return (
    <li role="presentation">
      <div
        id={headingId}
        className="sticky top-0 z-10 -mx-1.5 bg-surface/95 px-4.5 pb-1 pt-3 text-xs font-semibold text-ink-soft backdrop-blur-sm"
      >
        {label}
      </div>
      <ul role="group" aria-labelledby={headingId}>
        {children}
      </ul>
    </li>
  );
}
