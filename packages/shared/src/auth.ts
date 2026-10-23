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

export const ACCOUNT_LIMITS = {
  CITY_MAX: 80,
  /** Исходный файл фото; после перекодирования остаётся WebP 512×512, обычно 20-60 КБ. */
  AVATAR_MAX_BYTES: 5 * 1024 * 1024,
  AVATAR_SIZE: 512,
} as const;

/** Форматы фото профиля (по содержимому файла, а не по расширению). */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Оформление кабинета. По умолчанию светлая тема, как на всём сайте. */
export const UI_THEMES = ['light', 'dark', 'system'] as const;
export type UiTheme = (typeof UI_THEMES)[number];
export const UI_SCALES = ['compact', 'normal', 'large'] as const;
export type UiScale = (typeof UI_SCALES)[number];
export const UI_MOTIONS = ['system', 'reduced'] as const;
export type UiMotion = (typeof UI_MOTIONS)[number];

export interface UiPreferences {
  theme: UiTheme;
  scale: UiScale;
  motion: UiMotion;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: 'light',
  scale: 'normal',
  motion: 'system',
};

/** Пользователь в ответах API для него самого. Хеш пароля и сессии не отдаются никогда. */
export interface UserDto {
  id: string;
  /** Короткий номер аккаунта для поддержки («ID 100245»); доступа не даёт. */
  publicId: number;
  email: string;
  name: string;
  role: UserRole;
  /** +7XXXXXXXXXX или null */
  phone: string | null;
  city: string | null;
  /** Версия фото (ISO 8601 времени загрузки) для адреса картинки; null — фото нет. */
  avatarVersion: string | null;
  preferences: UiPreferences;
  /** ISO 8601 */
  createdAt: string;
}

export interface ProfileInput {
  name?: string;
  /** Пустая строка или null удаляет телефон. */
  phone?: string | null;
  city?: string | null;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

/** Устройство, на котором выполнен вход (сессия). Токен не отдаётся. */
export interface SessionDto {
  id: string;
  /** «Chrome, Windows» или null, если браузер не определён. */
  device: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 или null */
  lastSeenAt: string | null;
  current: boolean;
}

export interface AuthSessionDto {
  user: UserDto;
  /** Непрозрачный токен сессии; в БД хранится только его SHA-256. */
  token: string;
  /** ISO 8601 */
  expiresAt: string;
}

/**
 * Новый пароль по одноразовой ссылке. Почты пока нет: ссылку выдаёт администратор
 * (`/admin/users`) или команда на сервере (`docs/ACCOUNTS.md`). Ссылка действует TTL_HOURS часов
 * и один раз; новая ссылка отменяет прежние; после смены пароля все входы завершаются.
 */
export const PASSWORD_RESET_LIMITS = {
  TTL_HOURS: 24,
} as const;

/**
 * Защита от перебора пароля к одному адресу (с любых IP): первые FREE_FAILURES неверных
 * попыток подряд — без паузы, дальше перед каждой следующей — пауза BASE_DELAY_S, удваивается
 * до MAX_DELAY_S. Потолок — пауза, а не блокировка: чужие попытки не запирают владельца.
 * Серия ошибок обнуляется успешным входом или через WINDOW_MIN минут без попыток.
 */
export const LOGIN_THROTTLE = {
  FREE_FAILURES: 5,
  BASE_DELAY_S: 2,
  MAX_DELAY_S: 60,
  WINDOW_MIN: 15,
} as const;

/** Пауза перед следующей попыткой после failures неверных подряд, секунд. */
export function loginDelaySeconds(failures: number): number {
  if (failures < LOGIN_THROTTLE.FREE_FAILURES) return 0;
  const steps = failures - LOGIN_THROTTLE.FREE_FAILURES;
  return Math.min(
    LOGIN_THROTTLE.MAX_DELAY_S,
    LOGIN_THROTTLE.BASE_DELAY_S * 2 ** Math.min(steps, 10),
  );
}

export interface PasswordResetInput {
  /** Токен из ссылки `/reset/<токен>`. */
  token: string;
  password: string;
}

/** Выданная ссылка: токен показывается один раз, в базе только его хеш. */
export interface PasswordResetLinkDto {
  token: string;
  /** ISO 8601 */
  expiresAt: string;
}

/** Пользователь в списке администратора. */
export interface AdminUserDto {
  id: string;
  publicId: number;
  email: string;
  name: string;
  role: UserRole;
  blocked: boolean;
  /** ISO 8601 */
  createdAt: string;
  /** Заказов как заказчик и откликов как подрядчик. */
  jobs: number;
  bids: number;
  /** Жалоб на его заказы, сообщения и отклики, ждущих разбора. */
  openReports: number;
}

export const ADMIN_USER_LIMITS = {
  PAGE: 20,
  QUERY_MAX: 100,
} as const;
