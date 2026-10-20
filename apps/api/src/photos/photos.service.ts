import { PHOTO_LIMITS, type PhotoDto, type PhotoSize } from '@agregator/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { ENTITY_ID_PATTERN } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import { processPhoto, type ProcessedPhoto } from './photo-processing';

const PHOTO_NOT_FOUND = 'Фото не найдено';

/** Файл из multipart (multer, в памяти). */
export interface UploadedPhoto {
  buffer?: Buffer;
}

/** К чему прикладываются фото: к сообщению или к сдаче этапа (ровно к одному). */
export type PhotoTarget = {
  jobId: string;
  contractorId: string;
  uploaderId: string;
} & ({ messageId: string; stageId?: never } | { stageId: string; messageId?: never });

/** Поля фото для списков: без байтов. */
export const PHOTO_SELECT = { id: true, width: true, height: true, createdAt: true } as const;
export type PhotoRow = Prisma.JobPhotoGetPayload<{ select: typeof PHOTO_SELECT }>;

export function toPhotoDto(photo: PhotoRow): PhotoDto {
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt.toISOString(),
  };
}

/**
 * Фото к сообщениям и сдаче этапов. Хранятся в базе (job_photo_blobs): так они попадают в
 * копии, выгрузку вне сервера и проверку восстановления без отдельной настройки. Перед
 * публичным запуском хранение можно перенести в S3-совместимое хранилище, поменяв только
 * attach и read (docs/JOB_CHAT.md).
 */
@Injectable()
export class PhotosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Проверка и перекодирование до транзакции: работа процессора не держит блокировку заказа.
   * По одному файлу за раз — в памяти не больше двух копий одного фото.
   */
  async prepare(files: UploadedPhoto[] | undefined): Promise<ProcessedPhoto[]> {
    const list = (files ?? []).filter((file) => file.buffer?.length);
    if (list.length > PHOTO_LIMITS.PER_UPLOAD) {
      throw new BadRequestException(`Не больше ${PHOTO_LIMITS.PER_UPLOAD} фото за раз`);
    }
    const processed: ProcessedPhoto[] = [];
    for (const file of list) processed.push(await processPhoto(file.buffer!));
    return processed;
  }

  /**
   * Сохраняет фото. Вызывается под блокировкой строки заказа (FOR UPDATE), поэтому подсчёт
   * фото сделки и запись идут по очереди и параллельные загрузки не превысят предел сделки.
   */
  async attach(
    tx: Prisma.TransactionClient,
    target: PhotoTarget,
    photos: ProcessedPhoto[],
  ): Promise<void> {
    if (photos.length === 0) return;
    const stored = await tx.jobPhoto.count({
      where: { jobId: target.jobId, contractorId: target.contractorId },
    });
    if (stored + photos.length > PHOTO_LIMITS.PER_DEAL) {
      throw new ConflictException(
        `В сделке уже ${stored} фото из ${PHOTO_LIMITS.PER_DEAL} возможных: ` +
          `можно добавить ещё ${Math.max(0, PHOTO_LIMITS.PER_DEAL - stored)}`,
      );
    }
    for (const photo of photos) {
      await tx.jobPhoto.create({
        data: {
          jobId: target.jobId,
          contractorId: target.contractorId,
          uploaderId: target.uploaderId,
          stageId: target.stageId ?? null,
          messageId: target.messageId ?? null,
          width: photo.width,
          height: photo.height,
          bytes: photo.full.length,
          // Копии в собственный ArrayBuffer: Prisma принимает Bytes как Uint8Array<ArrayBuffer>.
          blob: {
            create: { full: new Uint8Array(photo.full), thumb: new Uint8Array(photo.thumb) },
          },
        },
      });
    }
  }

  /**
   * Байты фото для сторон текущей сделки (заказчик-владелец и выбранный исполнитель — тот, чей
   * отклик сейчас принят; после закрытия заказа он остаётся принятым) и администратора. Фото
   * прежней сделки (исполнитель отказался) недоступны ни ему, ни новому исполнителю, ни
   * заказчику — как и её переписка. Остальным фото неотличимо от несуществующего (404).
   */
  async read(user: User, jobId: string, photoId: string, size: PhotoSize): Promise<Buffer> {
    if (!ENTITY_ID_PATTERN.test(jobId) || !ENTITY_ID_PATTERN.test(photoId)) {
      throw new NotFoundException(PHOTO_NOT_FOUND);
    }
    const photo = await this.prisma.jobPhoto.findUnique({
      where: { id: photoId },
      select: {
        jobId: true,
        contractorId: true,
        job: { select: { ownerId: true } },
        message: { select: { hiddenAt: true } },
      },
    });
    const current =
      photo && photo.jobId === jobId && user.role !== 'ADMIN'
        ? await this.prisma.bid.findFirst({
            where: { jobId, status: 'ACCEPTED' },
            select: { contractorId: true },
          })
        : null;
    const allowed =
      photo !== null &&
      photo.jobId === jobId &&
      (user.role === 'ADMIN' ||
        // Фото скрытого модератором сообщения сторонам не отдаётся.
        (!photo.message?.hiddenAt &&
          current?.contractorId === photo.contractorId &&
          (user.id === photo.job.ownerId || user.id === photo.contractorId)));
    if (!allowed) throw new NotFoundException(PHOTO_NOT_FOUND);
    const blob =
      size === 'thumb'
        ? await this.prisma.jobPhotoBlob.findUnique({ where: { photoId }, select: { thumb: true } })
        : await this.prisma.jobPhotoBlob.findUnique({ where: { photoId }, select: { full: true } });
    if (!blob) throw new NotFoundException(PHOTO_NOT_FOUND);
    return Buffer.from('thumb' in blob ? blob.thumb : blob.full);
  }
}
