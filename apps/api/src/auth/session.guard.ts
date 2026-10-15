import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

/**
 * Требует `Authorization: Bearer <token>` с действующей сессией.
 * Пользователь и роль берутся только из БД по сессии, никогда из данных запроса.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const auth = token ? await this.auth.resolveSession(token) : null;
    if (!auth) {
      throw new UnauthorizedException('Требуется вход в аккаунт');
    }
    request.auth = auth;
    return true;
  }
}
