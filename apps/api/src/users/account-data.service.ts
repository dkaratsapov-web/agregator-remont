import { DELETED_USER_NAME, type AccountExportDto } from '@agregator/shared';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { writeAudit } from '../audit/audit';
import { LoginThrottle, loginKey } from '../auth/login-throttle';
import { hashPassword, verifyPassword } from '../auth/password';
import { ApiError, LoginThrottled } from '../common/api-error';
import { notify } from '../notifications/notify';
import { PrismaService } from '../prisma/prisma.service';

/** Ответ на попытку разблокировать удалённый аккаунт или выдать ему ссылку сброса пароля. */
export const ACCOUNT_DELETED = 'Аккаунт удалён по просьбе пользователя: восстановить его нельзя';

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

/**
 * Свои данные: выгрузка и удаление аккаунта (152-ФЗ, docs/ACCOUNTS.md, «Свои данные»).
 *
 * Удаление не стирает строку пользователя: на неё ссылаются заказы, отклики, переписка и
 * отзывы другой стороны. Стираются личные данные (имя, email, телефон, город, фото, профиль
 * мастера), черновики, избранное, уведомления, входы через банк и все сеансы; открытые заказы
 * отменяются, отклики на рассмотрении отзываются. Аккаунт блокируется навсегда.
 */
@Injectable()
export class AccountDataService {
  private readonly throttle: LoginThrottle;

  constructor(private readonly prisma: PrismaService) {
    this.throttle = new LoginThrottle(prisma);
  }

  async export(user: User): Promise<AccountExportDto> {
    const id = user.id;
    const [
      profile,
      avatar,
      jobs,
      drafts,
      bids,
      messages,
      reviewsWritten,
      reviewsReceived,
      favorites,
      reports,
      feedback,
      sessions,
      bankLogins,
      plans,
      photos,
      contactShares,
    ] = await Promise.all([
      this.prisma.contractorProfile.findUnique({ where: { userId: id } }),
      this.prisma.userAvatar.count({ where: { userId: id } }),
      this.prisma.job.findMany({
        where: { ownerId: id },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { bids: true } } },
      }),
      this.prisma.jobDraft.findMany({ where: { ownerId: id }, orderBy: { updatedAt: 'asc' } }),
      this.prisma.bid.findMany({ where: { contractorId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.jobMessage.findMany({
        where: { authorId: id },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { photos: true } } },
      }),
      this.prisma.review.findMany({ where: { authorId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.review.findMany({ where: { contractorId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.favoriteJob.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.report.findMany({ where: { reporterId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.feedback.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.session.findMany({
        where: { userId: id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.externalAccount.findMany({ where: { userId: id } }),
      // План общий для сторон сделки: свой заказ или заказ, где свой отклик выбран.
      this.prisma.jobPlan.findMany({
        where: {
          job: {
            OR: [{ ownerId: id }, { bids: { some: { contractorId: id, status: 'ACCEPTED' } } }],
          },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          stages: {
            orderBy: { position: 'asc' },
            include: { _count: { select: { photos: true } } },
          },
        },
      }),
      this.prisma.jobPhoto.findMany({ where: { uploaderId: id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.contactShare.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'asc' },
        include: { bid: { select: { jobId: true } } },
      }),
    ]);
    await writeAudit(this.prisma, {
      actorId: id,
      action: 'ACCOUNT_EXPORTED',
      entityType: 'user',
      entityId: id,
      changes: {},
    });
    return {
      exportedAt: iso(new Date()),
      account: {
        id,
        publicId: user.publicId,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        city: user.city,
        hasAvatar: avatar > 0,
        preferences: { theme: user.uiTheme, scale: user.uiScale, motion: user.uiMotion },
        createdAt: iso(user.createdAt),
      },
      contractorProfile: profile
        ? {
            about: profile.about,
            categories: profile.categories,
            cities: profile.cities,
            experienceYears: profile.experienceYears,
          }
        : null,
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        description: j.description,
        category: j.category,
        city: j.city,
        budgetMin: j.budgetMin,
        budgetMax: j.budgetMax,
        status: j.status,
        closeOutcome: j.closeOutcome,
        details: j.details,
        extraItems: j.extraItems,
        // Отклики — данные мастеров: в выгрузке заказчика только их число.
        bidsReceived: j._count.bids,
        createdAt: iso(j.createdAt),
      })),
      drafts: drafts.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        category: d.category,
        city: d.city,
        details: d.details,
        updatedAt: iso(d.updatedAt),
      })),
      bids: bids.map((b) => ({
        id: b.id,
        jobId: b.jobId,
        price: b.price,
        durationDays: b.durationDays,
        comment: b.comment,
        status: b.status,
        createdAt: iso(b.createdAt),
      })),
      messages: messages.map((m) => ({
        id: m.id,
        jobId: m.jobId,
        body: m.body,
        photos: m._count.photos,
        createdAt: iso(m.createdAt),
      })),
      reviewsWritten: reviewsWritten.map((r) => ({
        jobId: r.jobId,
        rating: r.rating,
        text: r.text,
        createdAt: iso(r.createdAt),
      })),
      // Отзыв о себе — без автора: его имя — чужие данные.
      reviewsReceived: reviewsReceived.map((r) => ({
        jobId: r.jobId,
        rating: r.rating,
        text: r.text,
        createdAt: iso(r.createdAt),
      })),
      favorites: favorites.map((f) => ({ jobId: f.jobId, createdAt: iso(f.createdAt) })),
      reports: reports.map((r) => ({
        targetType: r.targetType,
        reason: r.reason,
        comment: r.comment,
        status: r.status,
        createdAt: iso(r.createdAt),
      })),
      feedback: feedback.map((f) => ({
        kind: f.kind,
        body: f.body,
        page: f.page,
        createdAt: iso(f.createdAt),
        reply: f.reply,
        repliedAt: isoOrNull(f.repliedAt),
      })),
      sessions: sessions.map((s) => ({
        device: s.device,
        createdAt: iso(s.createdAt),
        lastSeenAt: isoOrNull(s.lastSeenAt),
      })),
      bankLogins: bankLogins.map((b) => ({ provider: b.provider, createdAt: iso(b.createdAt) })),
      plans: plans.map((plan) => ({
        jobId: plan.jobId,
        author: plan.author,
        sequential: plan.sequential,
        status: plan.status,
        returnReason: plan.returnReason,
        proposedAt: isoOrNull(plan.proposedAt),
        approvedAt: isoOrNull(plan.approvedAt),
        stages: plan.stages.map((st) => ({
          position: st.position,
          title: st.title,
          description: st.description,
          durationDays: st.durationDays,
          status: st.status,
          submitComment: st.submitComment,
          reworkComment: st.reworkComment,
          submittedAt: isoOrNull(st.submittedAt),
          acceptedAt: isoOrNull(st.acceptedAt),
          photos: st._count.photos,
        })),
      })),
      photos: photos.map((ph) => ({
        id: ph.id,
        jobId: ph.jobId,
        stageId: ph.stageId,
        messageId: ph.messageId,
        width: ph.width,
        height: ph.height,
        bytes: ph.bytes,
        createdAt: iso(ph.createdAt),
      })),
      contactShares: contactShares.map((c) => ({
        jobId: c.bid.jobId,
        createdAt: iso(c.createdAt),
      })),
    };
  }

  /**
   * Удаление по паролю. Неверный пароль считается в ту же серию, что вход и смена пароля.
   * Строка пользователя блокируется до конца транзакции: два одновременных удаления идут по
   * очереди, и второе отклоняется — его сеанс уже завершён.
   */
  async delete(user: User, sessionId: string, password: string): Promise<void> {
    const key = loginKey(user.email);
    const wait = await this.throttle.attempt(key);
    if (wait > 0) {
      throw new LoginThrottled(
        wait,
        `Слишком много неверных попыток ввести пароль. Повторите через ${wait} с.`,
      );
    }
    // Хеш недостижимого пароля: войти в удалённый аккаунт нельзя даже по старому паролю.
    const unusable = await hashPassword(randomBytes(32).toString('base64url'));
    await this.prisma.$transaction(async (tx) => {
      // FOR NO KEY UPDATE: удаление меняет обычные столбцы и не конфликтует с KEY SHARE внешних
      // ключей. С FOR UPDATE выбор исполнителя этого мастера (держит отклик, пишет ему
      // уведомление) и удаление (держит строку, ждёт отклик) ждали друг друга.
      const [row] = await tx.$queryRaw<{ password_hash: string; deleted_at: Date | null }[]>`
        SELECT password_hash, deleted_at FROM users WHERE id = ${user.id} FOR NO KEY UPDATE`;
      if ((await tx.session.count({ where: { id: sessionId, userId: user.id } })) === 0) {
        throw new UnauthorizedException('Сеанс завершён. Войдите снова');
      }
      if (!row || row.deleted_at) throw new UnauthorizedException('Сеанс завершён. Войдите снова');
      if (!(await verifyPassword(row.password_hash, password))) {
        throw new ApiError(400, 'PASSWORD_INVALID', 'Пароль указан неверно');
      }

      // Свои незакрытые заказы — под блокировкой: выбрать исполнителя в это время нельзя.
      const ownJobs = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status::text FROM jobs
        WHERE owner_id = ${user.id} AND status <> 'CLOSED'::"JobStatus"
        ORDER BY id FOR UPDATE`;
      // Свои отклики на рассмотрении и выбранные — тоже: их не выберут и не отклонят посреди
      // удаления. Заказы при этом не блокируются (порядок блокировок как у выбора исполнителя).
      const ownBids = await tx.$queryRaw<{ id: string; job_id: string; status: string }[]>`
        SELECT id, job_id, status::text FROM bids
        WHERE contractor_id = ${user.id}
          AND status IN ('PENDING'::"BidStatus", 'ACCEPTED'::"BidStatus")
        ORDER BY id FOR UPDATE`;
      const acceptedJobs = ownBids.filter((b) => b.status === 'ACCEPTED').map((b) => b.job_id);
      const inProgress =
        ownJobs.some((j) => j.status === 'IN_PROGRESS') ||
        (acceptedJobs.length > 0 &&
          (await tx.job.count({ where: { id: { in: acceptedJobs }, status: 'IN_PROGRESS' } })) > 0);
      if (inProgress) {
        throw new ApiError(
          409,
          'ACCOUNT_HAS_ACTIVE_DEALS',
          'Есть заказ в работе. Завершите или закройте его, затем удалите аккаунт',
        );
      }

      for (const job of ownJobs) {
        await tx.job.update({
          where: { id: job.id },
          data: { status: 'CLOSED', closeOutcome: 'CANCELLED' },
        });
        await writeAudit(tx, {
          actorId: user.id,
          action: 'JOB_CLOSED',
          entityType: 'job',
          entityId: job.id,
          changes: {
            status: { from: job.status, to: 'CLOSED' },
            reason: { from: null, to: 'ACCOUNT_DELETED' },
          },
        });
        const pending = await tx.bid.findMany({
          where: { jobId: job.id, status: 'PENDING' },
          select: { id: true, contractorId: true },
        });
        await tx.bid.updateMany({
          where: { id: { in: pending.map((b) => b.id) } },
          data: { status: 'REJECTED', rejectReason: 'JOB_CLOSED' },
        });
        for (const bid of pending) {
          await writeAudit(tx, {
            actorId: user.id,
            action: 'BID_REJECTED',
            entityType: 'bid',
            entityId: bid.id,
            changes: {
              status: { from: 'PENDING', to: 'REJECTED' },
              rejectReason: { from: null, to: 'JOB_CLOSED' },
            },
          });
          await notify(tx, {
            actorId: user.id,
            userId: bid.contractorId,
            jobId: job.id,
            kind: 'BID_REJECTED',
            data: { reason: 'JOB_CLOSED' },
          });
        }
      }

      const pendingBids = ownBids.filter((b) => b.status === 'PENDING');
      if (pendingBids.length > 0) {
        await tx.bid.updateMany({
          where: { id: { in: pendingBids.map((b) => b.id) } },
          data: { status: 'WITHDRAWN' },
        });
        const owners = await tx.job.findMany({
          where: { id: { in: pendingBids.map((b) => b.job_id) } },
          select: { id: true, ownerId: true },
        });
        for (const bid of pendingBids) {
          await writeAudit(tx, {
            actorId: user.id,
            action: 'BID_WITHDRAWN',
            entityType: 'bid',
            entityId: bid.id,
            changes: { status: { from: 'PENDING', to: 'WITHDRAWN' } },
          });
        }
        for (const job of owners) {
          await notify(tx, {
            actorId: user.id,
            userId: job.ownerId,
            jobId: job.id,
            kind: 'BID_WITHDRAWN',
          });
        }
      }

      const where = { userId: user.id };
      await tx.jobDraft.deleteMany({ where: { ownerId: user.id } });
      await tx.favoriteJob.deleteMany({ where });
      await tx.feedback.deleteMany({ where });
      await tx.notification.deleteMany({ where });
      await tx.contactShare.deleteMany({ where });
      await tx.externalAccount.deleteMany({ where });
      await tx.userAvatar.deleteMany({ where });
      await tx.contractorProfile.deleteMany({ where });
      await tx.passwordReset.deleteMany({ where });
      await tx.session.deleteMany({ where });

      const now = new Date();
      await tx.user.update({
        where: { id: user.id },
        data: {
          // Адрес освобождается: с ним можно зарегистрироваться заново. publicId уникален.
          email: `deleted-${user.publicId}@deleted.invalid`,
          name: DELETED_USER_NAME,
          phone: null,
          city: null,
          avatarUpdatedAt: null,
          passwordHash: unusable,
          deletedAt: now,
          blockedAt: user.blockedAt ?? now,
        },
      });
      await writeAudit(tx, {
        actorId: user.id,
        action: 'ACCOUNT_DELETED',
        entityType: 'user',
        entityId: user.id,
        changes: {
          openJobsClosed: { from: ownJobs.length, to: 0 },
          pendingBidsWithdrawn: { from: pendingBids.length, to: 0 },
        },
      });
    });
    await this.throttle.clear(key);
  }
}
