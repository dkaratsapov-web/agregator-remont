import { ExecutionContext, SetMetadata } from '@nestjs/common';

export const AUTH_THROTTLER = 'auth';
const AUTH_RATE_LIMITED = 'authRateLimited';

/** Подключает строгий лимит `auth` (вход, регистрация) в дополнение к общему. */
export const AuthRateLimited = () => SetMetadata(AUTH_RATE_LIMITED, true);

export function isAuthRateLimited(context: ExecutionContext): boolean {
  return Reflect.getMetadata(AUTH_RATE_LIMITED, context.getHandler()) === true;
}
