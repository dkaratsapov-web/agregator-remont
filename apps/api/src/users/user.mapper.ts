import type { UiMotion, UiScale, UiTheme, UserDto } from '@agregator/shared';
import type { User } from '@prisma/client';

/** Явный whitelist: passwordHash и служебные поля не могут попасть в ответ. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone,
    city: user.city,
    avatarVersion: user.avatarUpdatedAt?.toISOString() ?? null,
    // Значения ограничены CHECK в базе (миграция account_settings).
    preferences: {
      theme: user.uiTheme as UiTheme,
      scale: user.uiScale as UiScale,
      motion: user.uiMotion as UiMotion,
    },
    createdAt: user.createdAt.toISOString(),
  };
}
