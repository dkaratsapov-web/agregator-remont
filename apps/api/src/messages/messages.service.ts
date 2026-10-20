import { createHash } from 'node:crypto';
import { MESSAGE_LIMITS, type JobMessagesDto } from '@agregator/shared';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findDeal, type Deal } from '../plans/deal';
import {
  PHOTO_SELECT,
  PhotosService,
  toPhotoDto,
  type UploadedPhoto,
} from '../photos/photos.service';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/message.dto';

const NO_DEAL = 'Переписка появится после выбора исполнителя';
const BAD_CURSOR = 'Неверный курсор переписки';

/**
 * Отпечаток отправки: текст и исходные файлы (до перекодирования) в порядке отправки. Повтор
 * той же формы (двойной клик, обрыв связи) даёт тот же отпечаток, другая отправка с тем же
 * ключом — другой (как у публикации заказа, AUDIT_FINDINGS #40).
 */
function sendFingerprint(body: string, files: UploadedPhoto[] | undefined): string {
  const photos = (files ?? [])
    .filter((file) => file.buffer?.length)
    .map((file) => createHash('sha256').update(file.buffer!).digest('hex'));
  return createHash('sha256').update(JSON.stringify({ body, photos })).digest('hex');
}

/**
 * Переписка по заказу между заказчиком-владельцем и выбранным исполнителем. Своя для каждой
 * сделки: после отказа исполнителя новый исполнитель прежнюю не видит. Писать можно, пока
 * заказ в работе; после закрытия переписка остаётся для чтения. Остальным — 404.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: PhotosService,
  ) {}

  /** Последние сообщения сделки или, с before, — те, что раньше этого сообщения. */
  async list(userId: string, jobId: string, before?: string): Promise<JobMessagesDto> {
    const deal = await findDeal(this.prisma, userId, jobId, false, NO_DEAL);
    let cursor: { id: string; createdAt: Date } | undefined;
    if (before) {
      const found = await this.prisma.jobMessage.findFirst({
        where: { id: before, jobId: deal.jobId, contractorId: deal.contractorId },
        select: { id: true, createdAt: true },
      });
      if (!found) throw new BadRequestException(BAD_CURSOR);
      cursor = found;
    }
    return this.load(this.prisma, deal, userId, cursor);
  }

  async send(
    userId: string,
    jobId: string,
    dto: SendMessageDto,
    files: UploadedPhoto[] | undefined,
  ): Promise<JobMessagesDto> {
    const photos = await this.photos.prepare(files);
    if (!dto.body && photos.length === 0) {
      throw new BadRequestException('Напишите сообщение или приложите фото');
    }
    const requestHash = dto.requestId ? sendFingerprint(dto.body, files) : null;
    return this.prisma.$transaction(async (tx) => {
      const deal = await findDeal(tx, userId, jobId, true, NO_DEAL);
      if (dto.requestId) {
        const sent = await tx.jobMessage.findUnique({
          where: { authorId_requestId: { authorId: userId, requestId: dto.requestId } },
          select: { jobId: true, requestHash: true },
        });
        // Повтор той же отправки — уже отправлено. Тот же ключ с другим текстом или фото либо
        // от другого заказа — ошибка формы: ничего не создаётся и не теряется.
        if (sent?.jobId === jobId && sent.requestHash === requestHash) {
          return this.load(tx, deal, userId);
        }
        if (sent) throw new ConflictException('Форма устарела: обновите страницу');
      }
      if (deal.status !== 'IN_PROGRESS') {
        throw new ConflictException('Переписка открыта, пока заказ в работе');
      }
      const message = await tx.jobMessage.create({
        data: {
          jobId,
          contractorId: deal.contractorId,
          authorId: userId,
          body: dto.body,
          requestId: dto.requestId ?? null,
          requestHash,
        },
        select: { id: true },
      });
      await this.photos.attach(
        tx,
        { jobId, contractorId: deal.contractorId, uploaderId: userId, messageId: message.id },
        photos,
      );
      return this.load(tx, deal, userId);
    });
  }

  private async load(
    db: Prisma.TransactionClient,
    deal: Deal,
    userId: string,
    before?: { id: string; createdAt: Date },
  ): Promise<JobMessagesDto> {
    const found = await db.jobMessage.findMany({
      where: {
        jobId: deal.jobId,
        contractorId: deal.contractorId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.createdAt } },
                { createdAt: before.createdAt, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGE_LIMITS.PAGE + 1,
      select: {
        id: true,
        authorId: true,
        body: true,
        createdAt: true,
        photos: { select: PHOTO_SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    const rows = found.slice(0, MESSAGE_LIMITS.PAGE);
    return {
      jobId: deal.jobId,
      viewer: deal.viewer,
      canWrite: deal.status === 'IN_PROGRESS',
      hasEarlier: found.length > MESSAGE_LIMITS.PAGE,
      items: rows.reverse().map((row) => ({
        id: row.id,
        author: row.authorId === deal.contractorId ? 'CONTRACTOR' : 'OWNER',
        own: row.authorId === userId,
        body: row.body,
        photos: row.photos.map(toPhotoDto),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
