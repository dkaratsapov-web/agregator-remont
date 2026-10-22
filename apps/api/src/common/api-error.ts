import type { ApiErrorCode } from '@agregator/shared';
import { HttpException } from '@nestjs/common';

/**
 * Ошибка с машинным кодом (ADR 0002): `throw new ApiError(409, 'BID_ALREADY_EXISTS', 'Текст')`.
 * Фильтр ошибок дополняет тело полем `error` и отдаёт его как есть.
 */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: ApiErrorCode,
    message: string | string[],
    extra: Record<string, unknown> = {},
  ) {
    super({ statusCode: status, code, message, ...extra }, status);
  }
}

/**
 * Суточная квота исчерпана (429 DAILY_QUOTA_EXCEEDED). Фильтр ставит Retry-After — секунды до
 * момента, когда самая старая запись выйдет из скользящего окна. Клиент не повторяет сам, а
 * говорит человеку, когда можно снова.
 */
export class QuotaExceeded extends ApiError {
  readonly retryAfterSeconds: number;

  constructor(
    message: string,
    oldest: Date | null | undefined,
    windowMs: number,
    now = Date.now(),
  ) {
    super(429, 'DAILY_QUOTA_EXCEEDED', message);
    this.retryAfterSeconds = oldest
      ? Math.max(1, Math.ceil((oldest.getTime() + windowMs - now) / 1000))
      : Math.ceil(windowMs / 1000);
  }
}
