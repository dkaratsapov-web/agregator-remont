'use client';

import type { UiMotion, UiPreferences, UiScale, UiTheme } from '@agregator/shared';
import { useActionState, useRef, useState, useTransition } from 'react';
import { preferencesAction, type SettingsState } from '@/app/(site)/account/settings/actions';

const THEMES: { value: UiTheme; title: string; text: string }[] = [
  { value: 'light', title: 'Светлая', text: 'Фарфоровый фон, как на главной' },
  { value: 'dark', title: 'Тёмная', text: 'Мягкий тёмный фон для вечера' },
  { value: 'system', title: 'Как в системе', text: 'Следует настройке телефона или компьютера' },
];

const SCALES: { value: UiScale; title: string }[] = [
  { value: 'compact', title: 'Компактный' },
  { value: 'normal', title: 'Обычный' },
  { value: 'large', title: 'Крупный' },
];

const MOTIONS: { value: UiMotion; title: string; text: string }[] = [
  {
    value: 'system',
    title: 'Как в системе',
    text: 'Плавные переходы, если не отключены в системе',
  },
  { value: 'reduced', title: 'Меньше анимаций', text: 'Без движения и плавных переходов' },
];

/** Мини-превью темы: шапка, карточка и кнопка в цветах темы. */
function ThemePreview({ theme }: { theme: UiTheme }) {
  const light = { bg: '#f4f5f7', card: '#fbfbfc', line: '#dfe2e7', ink: '#0d1320' };
  const dark = { bg: '#0b0f17', card: '#121826', line: '#262f3f', ink: '#e8ecf2' };
  const half = (c: typeof light) => (
    <div className="h-full w-full p-2" style={{ background: c.bg }}>
      <div className="h-1.5 w-8 rounded-full" style={{ background: c.ink, opacity: 0.8 }} />
      <div
        className="mt-2 rounded-md border p-1.5"
        style={{ background: c.card, borderColor: c.line }}
      >
        <div className="h-1 w-10 rounded-full" style={{ background: c.ink, opacity: 0.5 }} />
        <div className="mt-1 h-1 w-6 rounded-full" style={{ background: c.ink, opacity: 0.3 }} />
      </div>
      <div className="mt-2 h-2.5 w-9 rounded-full bg-[#c2410c]" />
    </div>
  );
  return (
    <div aria-hidden="true" className="flex h-20 overflow-hidden rounded-xl ring-1 ring-line">
      {theme === 'system' ? (
        <>
          <div className="w-1/2 overflow-hidden">{half(light)}</div>
          <div className="w-1/2 overflow-hidden">{half(dark)}</div>
        </>
      ) : (
        half(theme === 'dark' ? dark : light)
      )}
    </div>
  );
}

const optionClass =
  'cursor-pointer rounded-2xl border border-line bg-surface p-3 transition-[border-color,box-shadow,background-color] duration-150 hover:border-ink-soft/50 has-[:checked]:border-accent has-[:checked]:shadow-[0_0_0_3px_var(--accent-tint)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent';

/**
 * Оформление сохраняется сразу при выборе: атрибуты на странице меняются мгновенно, а настройка
 * уходит на сервер и действует на всех устройствах пользователя.
 */
export function AppearanceForm({ preferences }: { preferences: UiPreferences }) {
  const [state, action] = useActionState<SettingsState, FormData>(preferencesAction, {});
  const [current, setCurrent] = useState(preferences);
  const [, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  function choose<K extends keyof UiPreferences>(key: K, value: UiPreferences[K]) {
    setCurrent((prev) => ({ ...prev, [key]: value }));
    const root = document.querySelector<HTMLElement>('[data-ui-theme]');
    root?.setAttribute(`data-ui-${key}`, value);
    const data = new FormData();
    data.set(key, value);
    startTransition(() => action(data));
  }

  return (
    <form ref={form} action={action} className="space-y-8">
      <fieldset>
        <legend className="font-semibold">Тема</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {THEMES.map((t) => (
            <label key={t.value} className={optionClass}>
              <input
                type="radio"
                name="theme"
                value={t.value}
                checked={current.theme === t.value}
                onChange={() => choose('theme', t.value)}
                className="sr-only"
              />
              <ThemePreview theme={t.value} />
              <span className="mt-3 block text-sm font-semibold">{t.title}</span>
              <span className="mt-0.5 block text-xs text-ink-soft">{t.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Масштаб интерфейса</legend>
        <div className="mt-3 inline-flex rounded-2xl border border-line bg-canvas p-1">
          {SCALES.map((s, i) => (
            <label
              key={s.value}
              className="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors duration-150 hover:text-ink has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-[var(--shadow-raised)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <input
                type="radio"
                name="scale"
                value={s.value}
                checked={current.scale === s.value}
                onChange={() => choose('scale', s.value)}
                className="sr-only"
              />
              <span style={{ fontSize: `${0.82 + i * 0.09}rem` }}>Аа</span> <span>{s.title}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Анимации</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MOTIONS.map((m) => (
            <label key={m.value} className={`${optionClass} flex items-start gap-3`}>
              <input
                type="radio"
                name="motion"
                value={m.value}
                checked={current.motion === m.value}
                onChange={() => choose('motion', m.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-line peer-checked:border-accent"
              >
                <span
                  className={`size-2.5 rounded-full ${current.motion === m.value ? 'bg-accent' : ''}`}
                />
              </span>
              <span>
                <span className="block text-sm font-semibold">{m.title}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">{m.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-ink-soft">
        {state.error ? <span className="text-accent">{state.error}</span> : state.done}
      </p>
    </form>
  );
}
