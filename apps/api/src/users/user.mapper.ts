import type { UserDto } from '@agregator/shared';
import type { User } from '@prisma/client';

/** Явный whitelist: passwordHash и служебные поля не могут попасть в ответ. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}
