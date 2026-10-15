import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext, AuthenticatedRequest } from './auth.types';

/** Контекст сессии, установленный SessionGuard. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!auth) {
      throw new Error('CurrentAuth used on a route without SessionGuard');
    }
    return auth;
  },
);
