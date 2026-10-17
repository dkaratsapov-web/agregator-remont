'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  groupItems,
  moveActiveIndex,
  typeaheadIndex,
  type ListGroup,
  type ListOption,
} from '@/lib/listbox';

export interface SelectProps {
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
  'aria-labelledby'?: string;
  'aria-label'?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

const TYPEAHEAD_RESET_MS = 600;

/**
 * Выпадающий список в стиле сайта (паттерн WAI-ARIA «select-only combobox»): кнопка
 * с aria-haspopup="listbox" и всплывающий список. Клавиатура: стрелки, Home/End,
 * PageUp/PageDown, Enter/Space, Escape, Tab, набор букв (typeahead).
 */
export function Select({
  name,
  options,
  groups,
  value: controlled,
  defaultValue = '',
  onChange,
  placeholder = 'Выберите',
  id,
  'aria-describedby': describedBy,
  'aria-labelledby': labelledBy,
  'aria-label': ariaLabel,
  required,
  invalid,
  disabled,
  className = '',
}: SelectProps) {
  const autoId = useId();
  const buttonId = id ?? `select-${autoId}`;
  const listId = `${buttonId}-list`;
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = controlled ?? uncontrolled;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ buffer: '', at: 0 });

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex === -1 ? null : options[selectedIndex];

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      if (controlled === undefined) setUncontrolled(option.value);
      onChange?.(option.value);
    },
    [controlled, onChange, options],
  );

  const openList = (index = selectedIndex) => {
    if (disabled) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setPlacement(below < 300 && rect.top > below ? 'up' : 'down');
    }
    setActive(index >= 0 ? index : moveActiveIndex(options, -1, 'first'));
    setOpen(true);
  };

  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  // Клик вне списка закрывает его.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Активный вариант всегда виден.
  useLayoutEffect(() => {
    if (!open || active < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const typeahead = (char: string) => {
    const now = Date.now();
    const state = typed.current;
    state.buffer = now - state.at > TYPEAHEAD_RESET_MS ? char : state.buffer + char;
    state.at = now;
    const from = open ? active : selectedIndex;
    const index = typeaheadIndex(options, state.buffer, from);
    if (index === -1) return;
    if (open) setActive(index);
    else commit(index);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const key = event.key;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
        event.preventDefault();
        openList(
          key === 'ArrowUp' && selectedIndex < 0
            ? moveActiveIndex(options, -1, 'last')
            : selectedIndex,
        );
      } else if (key === 'Home' || key === 'End') {
        event.preventDefault();
        openList(moveActiveIndex(options, -1, key === 'Home' ? 'first' : 'last'));
      } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        typeahead(key);
      }
      return;
    }
    const moves: Record<string, Parameters<typeof moveActiveIndex>[2]> = {
      ArrowDown: 'next',
      ArrowUp: 'prev',
      Home: 'first',
      End: 'last',
      PageDown: 'pageDown',
      PageUp: 'pageUp',
    };
    if (moves[key]) {
      event.preventDefault();
      setActive((current) => moveActiveIndex(options, current, moves[key]));
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (
        key === ' ' &&
        typed.current.buffer &&
        Date.now() - typed.current.at < TYPEAHEAD_RESET_MS
      ) {
        typeahead(' ');
        return;
      }
      commit(active);
      close();
    } else if (key === 'Escape') {
      event.preventDefault();
      close();
    } else if (key === 'Tab') {
      commit(active);
      setOpen(false);
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeahead(key);
    }
  };

  const items = options.map((option, index) => ({ option, index }));
  const sections = groupItems(items, groups);
  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-describedby={describedBy}
        aria-labelledby={labelledBy ? `${labelledBy} ${buttonId}` : undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
        }}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-surface px-4 text-left text-base transition-[border-color,box-shadow] duration-150 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-60 ${
          invalid ? 'border-accent' : 'border-line hover:border-ink-soft/40'
        } ${open ? 'border-accent' : ''}`}
      >
        <span className={`truncate ${selected ? 'text-ink' : 'text-ink-soft/80'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`size-5 shrink-0 text-ink-soft transition-transform duration-200 motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
        >
          <path
            d="M5.5 7.75 10 12.25l4.5-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        tabIndex={-1}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : (ariaLabel ?? placeholder)}
        hidden={!open}
        onMouseDown={(event) => event.preventDefault()}
        className={`absolute inset-x-0 z-40 max-h-[22rem] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-[0_18px_44px_-18px_hsl(var(--shadow-color)/0.45),0_2px_6px_-2px_hsl(var(--shadow-color)/0.12)] transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none starting:opacity-0 ${
          placement === 'up'
            ? 'bottom-full mb-2 origin-bottom starting:translate-y-1'
            : 'top-full mt-2 origin-top starting:-translate-y-1'
        }`}
      >
        {sections.map((section) => (
          <SelectSection
            key={section.group?.id ?? '_'}
            label={section.group?.label}
            listId={listId}
          >
            {section.items.map(({ option, index }) => {
              const isSelected = index === selectedIndex;
              return (
                <li
                  key={option.value}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onPointerMove={() => !option.disabled && setActive(index)}
                  onClick={() => {
                    if (option.disabled) return;
                    commit(index);
                    close();
                  }}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-[15px] text-ink ${
                    index === active ? 'bg-muted-tint' : ''
                  } ${isSelected ? 'font-semibold' : ''} ${
                    option.disabled ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                >
                  <span>{option.label}</span>
                  {isSelected ? <CheckIcon /> : null}
                </li>
              );
            })}
          </SelectSection>
        ))}
      </ul>
    </div>
  );
}

function SelectSection({
  label,
  listId,
  children,
}: {
  label?: string;
  listId: string;
  children: React.ReactNode;
}) {
  const headingId = `${listId}-group-${useId()}`;
  if (!label) return <>{children}</>;
  return (
    <li role="presentation">
      <div id={headingId} className="px-3 pb-1 pt-3 text-xs font-semibold text-ink-soft">
        {label}
      </div>
      <ul role="group" aria-labelledby={headingId}>
        {children}
      </ul>
    </li>
  );
}

export function CheckIcon({ className = 'size-4 text-accent' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`shrink-0 ${className}`}>
      <path
        d="m3.5 8.25 3 3 6-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
