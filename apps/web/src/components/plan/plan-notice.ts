/** Сообщение после действия с планом (параметр `plan` в адресе после перенаправления). */
const PLAN_NOTICES: Record<string, string> = {
  saved: 'Черновик плана сохранён.',
  proposed: 'План отправлен на согласование.',
  author: 'Составитель плана изменён.',
  approved: 'План согласован.',
  returned: 'План возвращён с комментарием.',
  submitted: 'Этап сдан, ждём проверки заказчика.',
  accepted: 'Этап принят.',
  rework: 'Этап возвращён на доработку.',
};

export function planNotice(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? (PLAN_NOTICES[value] ?? null) : null;
}
