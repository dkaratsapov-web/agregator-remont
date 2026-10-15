/** Роли. ADMIN назначается только вручную на сервере и не доступна при регистрации. */
export const USER_ROLES = ['CUSTOMER', 'CONTRACTOR', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SELF_SERVICE_ROLES = ['CUSTOMER', 'CONTRACTOR'] as const;
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  CUSTOMER: 'Заказчик',
  CONTRACTOR: 'Подрядчик',
  ADMIN: 'Администратор',
};

export const AUTH_LIMITS = {
  PASSWORD_MIN: 10,
  /** Верхняя граница защищает от DoS дорогим хешированием длинных строк. */
  PASSWORD_MAX: 128,
  EMAIL_MAX: 254,
  NAME_MIN: 2,
  NAME_MAX: 80,
} as const;

/** Пользователь в ответах API для него самого. Хеш пароля и сессии не отдаются никогда. */
export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** ISO 8601 */
  createdAt: string;
}

export interface AuthSessionDto {
  user: UserDto;
  /** Непрозрачный токен сессии; в БД хранится только его SHA-256. */
  token: string;
  /** ISO 8601 */
  expiresAt: string;
}
