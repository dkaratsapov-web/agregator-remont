import { normalizeRuPhone, type SessionDto, type UserDto } from '@agregator/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { hashPassword, verifyPassword } from '../auth/password';
import { ENTITY_ID_PATTERN } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import { processAvatar } from './avatar';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { UpdatePreferencesDto } from './dto/update-preferences.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { toUserDto } from './user.mapper';

/** Личный кабинет: профиль, оформление, пароль, устройства и фото. Только для себя. */
@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(user: User, dto: UpdateProfileDto): Promise<UserDto> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.phone !== undefined) {
      if (dto.phone === null) {
        data.phone = null;
      } else {
        const phone = normalizeRuPhone(dto.phone);
        if (!phone) {
          throw new BadRequestException(
            'Укажите российский номер телефона, например +7 900 123-45-67',
          );
        }
        data.phone = phone;
      }
    }
    const updated = await this.prisma.user.update({ where: { id: user.id }, data });
    return toUserDto(updated);
  }

  async updatePreferences(user: User, dto: UpdatePreferencesDto): Promise<UserDto> {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { uiTheme: dto.theme, uiScale: dto.scale, uiMotion: dto.motion },
    });
    return toUserDto(updated);
  }

  /**
   * Смена пароля: нужен текущий пароль; все остальные сессии завершаются (если пароль меняют
   * из-за утечки, чужой вход должен прекратиться), текущая остаётся. Запись в журнал аудита.
   * Строка пользователя блокируется, и текущий пароль проверяется по хешу под блокировкой: две
   * одновременные смены из разных сессий не проходят обе, а смена из уже завершённой сессии
   * отклоняется (AUDIT_FINDINGS SEC-5).
   */
  async changePassword(user: User, sessionId: string, dto: ChangePasswordDto): Promise<void> {
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Новый пароль должен отличаться от текущего');
    }
    if (dto.newPassword.toLowerCase() === user.email) {
      throw new BadRequestException('Пароль не должен совпадать с email');
    }
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ password_hash: string }[]>`
        SELECT password_hash FROM users WHERE id = ${user.id} FOR UPDATE`;
      if (!row || !(await verifyPassword(row.password_hash, dto.currentPassword))) {
        throw new BadRequestException('Текущий пароль указан неверно');
      }
      if ((await tx.session.count({ where: { id: sessionId, userId: user.id } })) === 0) {
        throw new UnauthorizedException('Сеанс завершён. Войдите снова');
      }
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      const { count } = await tx.session.deleteMany({
        where: { userId: user.id, id: { not: sessionId } },
      });
      await writeAudit(tx, {
        actorId: user.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'user',
        entityId: user.id,
        changes: { otherSessions: { from: count, to: 0 } },
      });
    });
  }

  async listSessions(user: User, sessionId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      device: s.device,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
      current: s.id === sessionId,
    }));
  }

  /** Завершить один чужой вход. Текущую сессию так не закрыть: для неё есть выход. */
  async revokeSession(user: User, sessionId: string, targetId: string): Promise<void> {
    if (!ENTITY_ID_PATTERN.test(targetId)) throw new NotFoundException('Сеанс не найден');
    if (targetId === sessionId) {
      throw new BadRequestException('Это текущий сеанс: чтобы завершить его, выйдите из аккаунта');
    }
    await this.prisma.$transaction(async (tx) => {
      // userId в условии: чужую сессию не найти и не удалить даже по верному id.
      const { count } = await tx.session.deleteMany({ where: { id: targetId, userId: user.id } });
      if (count === 0) throw new NotFoundException('Сеанс не найден');
      await writeAudit(tx, {
        actorId: user.id,
        action: 'SESSIONS_REVOKED',
        entityType: 'user',
        entityId: user.id,
        changes: { session: { from: targetId, to: null } },
      });
    });
  }

  async revokeOtherSessions(user: User, sessionId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.session.deleteMany({
        where: { userId: user.id, id: { not: sessionId } },
      });
      if (count > 0) {
        await writeAudit(tx, {
          actorId: user.id,
          action: 'SESSIONS_REVOKED',
          entityType: 'user',
          entityId: user.id,
          changes: { otherSessions: { from: count, to: 0 } },
        });
      }
      return count;
    });
  }

  async setAvatar(user: User, file: Buffer): Promise<UserDto> {
    // Копия в собственный ArrayBuffer: Prisma принимает Bytes как Uint8Array<ArrayBuffer>.
    const data = new Uint8Array(await processAvatar(file));
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.userAvatar.upsert({
        where: { userId: user.id },
        create: { userId: user.id, data },
        update: { data },
      });
      return tx.user.update({ where: { id: user.id }, data: { avatarUpdatedAt: new Date() } });
    });
    return toUserDto(updated);
  }

  async deleteAvatar(user: User): Promise<UserDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.userAvatar.deleteMany({ where: { userId: user.id } });
      return tx.user.update({ where: { id: user.id }, data: { avatarUpdatedAt: null } });
    });
    return toUserDto(updated);
  }

  async getAvatar(user: User): Promise<Buffer> {
    const avatar = await this.prisma.userAvatar.findUnique({ where: { userId: user.id } });
    if (!avatar) throw new NotFoundException('Фото не загружено');
    return Buffer.from(avatar.data);
  }
}
