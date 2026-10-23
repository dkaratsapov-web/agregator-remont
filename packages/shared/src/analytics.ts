/**
 * Аналитика без персональных данных: сколько раз за день прошли шаги воронки. Только числа по
 * дням (часовой пояс Москвы) — ни id людей, ни адресов, ни cookie. Считается по уже записанным
 * событиям (регистрации, журнал действий, сообщения) и по счётчикам просмотров
 * (usage_counters).
 */
export const ANALYTICS_METRICS = [
  'CUSTOMERS_REGISTERED',
  'CONTRACTORS_REGISTERED',
  'CATALOG_VIEWS',
  'JOB_VIEWS',
  'DRAFTS_STARTED',
  'JOBS_PUBLISHED',
  'BIDS_PLACED',
  'CONTRACTORS_CHOSEN',
  'MESSAGES_SENT',
  'JOBS_COMPLETED',
  'REVIEWS_LEFT',
  'CONTACTS_SHARED',
] as const;
export type AnalyticsMetric = (typeof ANALYTICS_METRICS)[number];

export const ANALYTICS_METRIC_LABELS: Record<AnalyticsMetric, string> = {
  CUSTOMERS_REGISTERED: 'Регистрации заказчиков',
  CONTRACTORS_REGISTERED: 'Регистрации подрядчиков',
  CATALOG_VIEWS: 'Открытия каталога',
  JOB_VIEWS: 'Просмотры карточек заказов',
  DRAFTS_STARTED: 'Начатые черновики',
  JOBS_PUBLISHED: 'Опубликованные заказы',
  BIDS_PLACED: 'Отклики',
  CONTRACTORS_CHOSEN: 'Выбран исполнитель',
  MESSAGES_SENT: 'Сообщения в переписке',
  JOBS_COMPLETED: 'Заказы выполнены',
  REVIEWS_LEFT: 'Отзывы',
  CONTACTS_SHARED: 'Открыты контакты',
};

/** Счётчики, которых нет в других таблицах (usage_counters). */
export const USAGE_COUNTERS = ['CATALOG_VIEWS', 'JOB_VIEWS', 'DRAFTS_STARTED'] as const;
export type UsageCounter = (typeof USAGE_COUNTERS)[number];

/** Период отчёта, дней. */
export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export interface AnalyticsSeriesDto {
  metric: AnalyticsMetric;
  total: number;
  /** По дням, в порядке `days`. */
  perDay: number[];
}

export interface AnalyticsDto {
  /** Дни периода, YYYY-MM-DD по Москве, от старых к сегодняшнему. */
  days: string[];
  series: AnalyticsSeriesDto[];
}
