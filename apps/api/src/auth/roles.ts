import type { UserRole } from '@agregator/shared';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from './auth.types';

const ROLES_KEY = 'roles';

/** Разрешает обработчик только указанным ролям. Использовать вместе с SessionGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const { auth } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Нет сессии здесь означает ошибку конфигурации маршрута: запрещаем, а не пропускаем.
    if (!auth || !roles.includes(auth.user.role)) {
      throw new ForbiddenException('Недостаточно прав');
    }
    return true;
  }
}
