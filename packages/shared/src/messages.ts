/**
 * Переписка по заказу и фото (фаза 2, без денег). Переписка — между заказчиком-владельцем и
 * выбранным исполнителем, своя для каждой сделки: если исполнитель отказался и выбран другой,
 * новый не видит прежнюю переписку. Фото прикладываются к сообщению или к сдаче этапа (фото-отчёт)
 * и видны только сторонам сделки (и администратору). Контакты сторон сервис не показывает.
 */
import type { PlanParty } from './plans';

export const MESSAGE_LIMITS = {
  /** Текст сообщения; без текста можно, если приложено фото. */
  BODY_MAX: 2000,
  /** Сколько последних сообщений отдаётся за раз. */
  PAGE: 200,
} as const;

export const PHOTO_LIMITS = {
  /** Фото в одном сообщении или одной сдаче этапа. */
  PER_UPLOAD: 5,
  /** Один исходный файл до перекодирования. */
  INPUT_MAX_BYTES: 8 * 1024 * 1024,
  /** Весь запрос с фото (Caddy и Server Actions пропускают не больше). */
  REQUEST_MAX_BYTES: 26 * 1024 * 1024,
  /** Сторона полного фото после перекодирования, px. */
  FULL_MAX_SIDE: 2000,
  /** Сторона миниатюры, px. */
  THUMB_MAX_SIDE: 480,
} as const;

/** Размер фото в ответе: миниатюра для списков, полное — по нажатию. */
export const PHOTO_SIZES = ['thumb', 'full'] as const;
export type PhotoSize = (typeof PHOTO_SIZES)[number];

export interface PhotoDto {
  id: string;
  /** Размер полного фото, px (миниатюра — пропорционально). */
  width: number;
  height: number;
  /** ISO 8601 */
  createdAt: string;
}

export interface JobMessageDto {
  id: string;
  /** Чья реплика: заказчик или исполнитель. */
  author: PlanParty;
  /** Своё ли сообщение для того, кто смотрит. */
  own: boolean;
  body: string;
  photos: PhotoDto[];
  /** ISO 8601 */
  createdAt: string;
}

export interface JobMessagesDto {
  jobId: string;
  /** Кто смотрит. */
  viewer: PlanParty;
  /** Можно ли писать: заказ в работе. После закрытия переписка — только для чтения. */
  canWrite: boolean;
  /** Последние сообщения, от старых к новым. */
  items: JobMessageDto[];
}
