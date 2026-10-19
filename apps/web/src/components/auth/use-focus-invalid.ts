'use client';

import { useEffect, type RefObject } from 'react';

/**
 * После ответа сервера с ошибкой фокус переходит на первое поле с ошибкой (aria-invalid):
 * скринридер читает поле и связанный с ним текст ошибки, человек сразу исправляет
 * (AUDIT_FINDINGS UX-5). Без ошибок по полям фокус не трогаем: общий текст объявляет role=alert.
 */
export function useFocusInvalid(form: RefObject<HTMLFormElement | null>, state: object): void {
  useEffect(() => {
    const invalid = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    // Группа (fieldset с чекбоксами) сама фокус не принимает: берём её первое поле.
    const target = invalid?.matches('input, textarea, select')
      ? invalid
      : invalid?.querySelector<HTMLElement>('input, textarea, select');
    target?.focus();
  }, [form, state]);
}
