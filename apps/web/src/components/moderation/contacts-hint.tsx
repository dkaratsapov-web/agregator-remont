'use client';

import { contactsWarning, detectContacts } from '@agregator/shared';

/**
 * Предупреждение под полем ввода, пока человек пишет: в тексте похоже на контакты. Отправке не
 * мешает — сервер всё равно ставит пометку для модератора (moderation/content-flags.ts в API).
 */
export function ContactsHint({ text, id }: { text: string; id?: string }) {
  const warning = contactsWarning(detectContacts(text));
  return (
    <p
      id={id}
      aria-live="polite"
      className="mt-1.5 text-sm leading-relaxed text-accent-hover empty:mt-0"
    >
      {warning}
    </p>
  );
}
