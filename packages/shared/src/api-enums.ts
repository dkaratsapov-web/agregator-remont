/**
 * Открытые и закрытые перечни значений в API (ADR 0001, раздел 2). Каждый именованный enum
 * в openapi.json помечен `x-enum-kind`; у открытых ещё `x-extensible-enum`. Новый enum без
 * пометки здесь останавливает сборку openapi.json.
 *
 * - Открытый: список может пополняться без новой версии API. Клиент обязан показать
 *   незнакомое значение нейтрально (общий текст, без падения и без особой логики).
 * - Закрытый: значения управляют логикой клиента (переходы статусов, права). Новое значение в
 *   ответе — несовместимое изменение (ADR 0001, матрица совместимости).
 */
export const OPEN_API_ENUMS = [
  'JobCategory',
  'NotificationKind',
  'ContentFlagKind',
  'ReportReason',
  'FeedbackKind',
  'BidRejectReason',
  'AnalyticsMetric',
  'FieldErrorCode',
] as const;

export const CLOSED_API_ENUMS = [
  'JobStatus',
  'JobCloseOutcome',
  'JobSort',
  'BidStatus',
  'PlanStatus',
  'StageStatus',
  'PlanParty',
  'UserRole',
  'SelfServiceRole',
  'ReportStatus',
  'ReportTarget',
  'ContentFlagTarget',
  'Currency',
  'UiTheme',
  'UiScale',
  'UiMotion',
] as const;

/**
 * Безымянные перечни внутри схем (путь «Схема.поле»), которые тоже открыты: банки для входа
 * добавляются без новой версии API. Остальные безымянные перечни — закрытые.
 */
export const OPEN_INLINE_API_ENUMS = ['OAuthProviderDto.id', 'LinkedBankDto.provider'] as const;
