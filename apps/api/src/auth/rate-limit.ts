import { ExecutionContext, SetMetadata } from '@nestjs/common';

export const AUTH_THROTTLER = 'auth';
export const WRITE_THROTTLER = 'write';
const AUTH_RATE_LIMITED = 'authRateLimited';
const WRITE_RATE_LIMITED = 'writeRateLimited';

/** Подключает строгий лимит `auth` (вход, регистрация) в дополнение к общему. */
export const AuthRateLimited = () => SetMetadata(AUTH_RATE_LIMITED, true);

/** Подключает лимит `write` для эндпоинтов, изменяющих данные. */
export const WriteRateLimited = () => SetMetadata(WRITE_RATE_LIMITED, true);

export function isAuthRateLimited(context: ExecutionContext): boolean {
  return Reflect.getMetadata(AUTH_RATE_LIMITED, context.getHandler()) === true;
}

export function isWriteRateLimited(context: ExecutionContext): boolean {
  return Reflect.getMetadata(WRITE_RATE_LIMITED, context.getHandler()) === true;
}
