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

  async list(userId: string, jobId: string): Promise<JobMessagesDto> {
    const deal = await findDeal(this.prisma, userId, jobId, false, NO_DEAL);
    return this.load(this.prisma, deal, userId);
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
    return this.prisma.$transaction(async (tx) => {
      const deal = await findDeal(tx, userId, jobId, true, NO_DEAL);
      if (dto.requestId) {
        const sent = await tx.jobMessage.findUnique({
          where: { authorId_requestId: { authorId: userId, requestId: dto.requestId } },
          select: { jobId: true },
        });
        // Повтор той же отправки — уже отправлено; ключ от другого заказа — ошибка формы.
        if (sent?.jobId === jobId) return this.load(tx, deal, userId);
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
  ): Promise<JobMessagesDto> {
    const rows = await db.jobMessage.findMany({
      where: { jobId: deal.jobId, contractorId: deal.contractorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGE_LIMITS.PAGE,
      select: {
        id: true,
        authorId: true,
        body: true,
        createdAt: true,
        photos: { select: PHOTO_SELECT, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
    return {
      jobId: deal.jobId,
      viewer: deal.viewer,
      canWrite: deal.status === 'IN_PROGRESS',
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
