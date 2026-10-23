import type { ApiErrorCode } from '@agregator/shared';
import { HttpException } from '@nestjs/common';

/**
 * Ошибка с машинным кодом (ADR 0002): `throw new ApiError(409, 'BID_ALREADY_EXISTS', 'Текст')`.
 * Фильтр ошибок дополняет тело полем `error` и отдаёт его как есть.
 */
export class ApiError extends HttpException {
  /** Через сколько секунд можно повторить: фильтр ставит заголовок Retry-After. */
  retryAfterSeconds?: number;

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

/** Слишком много неверных паролей к одному адресу подряд: пауза перед следующей попыткой. */
export class LoginThrottled extends ApiError {
  constructor(
    seconds: number,
    message = `Слишком много неверных попыток входа для этого адреса. Повторите через ${seconds} с или восстановите пароль.`,
  ) {
    super(429, 'LOGIN_THROTTLED', message);
    this.retryAfterSeconds = seconds;
  }
}
