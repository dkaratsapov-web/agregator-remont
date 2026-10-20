import { PHOTO_LIMITS, type PhotoDto, type PhotoSize } from '@agregator/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async attach(
    tx: Prisma.TransactionClient,
    target: PhotoTarget,
    photos: ProcessedPhoto[],
  ): Promise<void> {
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
   * Байты фото для сторон сделки (заказчик-владелец, исполнитель этой сделки) и
   * администратора; остальным фото неотличимо от несуществующего (404).
   */
  async read(user: User, jobId: string, photoId: string, size: PhotoSize): Promise<Buffer> {
    if (!ENTITY_ID_PATTERN.test(jobId) || !ENTITY_ID_PATTERN.test(photoId)) {
      throw new NotFoundException(PHOTO_NOT_FOUND);
    }
    const photo = await this.prisma.jobPhoto.findUnique({
      where: { id: photoId },
      select: { jobId: true, contractorId: true, job: { select: { ownerId: true } } },
    });
    const allowed =
      photo !== null &&
      photo.jobId === jobId &&
      (user.role === 'ADMIN' || user.id === photo.job.ownerId || user.id === photo.contractorId);
    if (!allowed) throw new NotFoundException(PHOTO_NOT_FOUND);
    const blob =
      size === 'thumb'
        ? await this.prisma.jobPhotoBlob.findUnique({ where: { photoId }, select: { thumb: true } })
        : await this.prisma.jobPhotoBlob.findUnique({ where: { photoId }, select: { full: true } });
    if (!blob) throw new NotFoundException(PHOTO_NOT_FOUND);
    return Buffer.from('thumb' in blob ? blob.thumb : blob.full);
  }
}
