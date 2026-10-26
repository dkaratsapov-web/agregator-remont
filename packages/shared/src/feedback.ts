import type { UserRole } from './auth';

/**
 * Обратная связь от участников закрытого тестирования (docs/FEEDBACK.md): ошибка, идея или
 * вопрос из кабинета; администратор отвечает, человек видит ответ в «Моих обращениях».
 */
export const FEEDBACK_KINDS = ['BUG', 'IDEA', 'QUESTION'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  BUG: 'Ошибка',
  IDEA: 'Идея',
  QUESTION: 'Вопрос',
};

export const FEEDBACK_LIMITS = {
  BODY_MIN: 10,
  BODY_MAX: 2000,
  /** Адрес страницы, с которой написали (путь сайта, без домена). */
  PAGE_MAX: 200,
  REPLY_MIN: 2,
  REPLY_MAX: 2000,
  /** Обращений одного человека за сутки. */
  PER_DAY_MAX: 10,
} as const;

export interface FeedbackInput {
  kind: FeedbackKind;
  body: string;
  /** Путь страницы сайта, например /account/jobs/new; необязательно. */
  page?: string;
}

export interface FeedbackDto {
  id: string;
  kind: FeedbackKind;
  body: string;
  page: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** Ответ администратора; null — ещё не ответили. */
  reply: string | null;
  repliedAt: string | null;
}

export interface AdminFeedbackDto extends FeedbackDto {
  author: { id: string; publicId: number; name: string; role: UserRole };
}

export interface FeedbackReplyInput {
  reply: string;
}
