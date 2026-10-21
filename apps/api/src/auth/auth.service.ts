import type { AuthSessionDto } from '@agregator/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { writeAudit } from '../audit/audit';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto } from '../users/user.mapper';
import type { AuthContext } from './auth.types';
import { deviceLabel } from './device';
import { LoginDto } from './dto/login.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { RegisterDto } from './dto/register.dto';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import {
  generateSessionToken,
  hashSessionToken,
  isWellFormedSessionToken,
  SESSION_TTL_MS,
} from './session-token';

const INVALID_CREDENTIALS = 'Неверный email или пароль';
const RESET_INVALID =
  'Ссылка для пароля недействительна: устарела, уже использована или заменена новой. Попросите новую ссылку.';
export const ACCOUNT_BLOCKED =
  'Аккаунт заблокирован администратором. Если это ошибка, напишите в поддержку.';
/** Время активности сеанса обновляется не чаще раза в час, а не на каждый запрос. */
const LAST_SEEN_STEP_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto, userAgent?: string): Promise<AuthSessionDto> {
    if (dto.password.toLowerCase() === dto.email) {
      throw new ConflictException('Пароль не должен совпадать с email');
    }
    const passwordHash = await hashPassword(dto.password);
    try {
      // Пользователь и первая сессия создаются атомарно: при сбое записи сессии не остаётся
      // «осиротевшего» аккаунта, на повторную регистрацию которого пришёл бы 409.
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: dto.email, passwordHash, name: dto.name, role: dto.role },
        });
        return this.createSession(tx, user, userAgent);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Пользователь с таким email уже зарегистрирован');
      }
      throw error;
    }
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthSessionDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Пароль проверяется и для несуществующего email, чтобы не раскрывать его по времени ответа.
    const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // О блокировке говорим только после верного пароля: иначе по ответу можно было бы
    // узнавать заблокированные адреса.
    if (user.blockedAt) throw new ForbiddenException(ACCOUNT_BLOCKED);
    // Сессия создаётся под блокировкой строки пользователя и только если хеш пароля не сменился
    // после проверки: вход по старому паролю в момент смены не переживёт её (SEC-5).
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ password_hash: string }[]>`
        SELECT password_hash FROM users WHERE id = ${user.id} FOR UPDATE`;
      if (row?.password_hash !== user.passwordHash) {
        throw new UnauthorizedException(INVALID_CREDENTIALS);
      }
      await tx.session.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
      return this.createSession(tx, user, userAgent);
    });
  }

  /**
   * Новый пароль по одноразовой ссылке: ссылка гаснет, все прежние входы завершаются, человек
   * сразу входит с новым паролем. Повтор той же ссылки, просроченная или заменённая — 400.
   */
  async resetPassword(dto: PasswordResetDto, userAgent?: string): Promise<AuthSessionDto> {
    if (!isWellFormedSessionToken(dto.token)) throw new BadRequestException(RESET_INVALID);
    const tokenHash = hashSessionToken(dto.token);
    const pending = await this.prisma.passwordReset.findUnique({
      where: { tokenHash },
      select: { user: { select: { email: true } } },
    });
    if (!pending) throw new BadRequestException(RESET_INVALID);
    if (dto.password.toLowerCase() === pending.user.email) {
      throw new BadRequestException('Пароль не должен совпадать с email');
    }
    const passwordHash = await hashPassword(dto.password);
    return this.prisma.$transaction(async (tx) => {
      // Ссылка под блокировкой: два одновременных запроса с ней не сменят пароль дважды.
      const [reset] = await tx.$queryRaw<
        { id: string; user_id: string; expires_at: Date; used_at: Date | null }[]
      >`SELECT id, user_id, expires_at, used_at FROM password_resets
        WHERE token_hash = ${tokenHash} FOR UPDATE`;
      if (!reset || reset.used_at || reset.expires_at <= new Date()) {
        throw new BadRequestException(RESET_INVALID);
      }
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${reset.user_id} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: reset.user_id } });
      if (user.blockedAt) throw new ForbiddenException(ACCOUNT_BLOCKED);
      const updated = await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      await tx.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
      const { count } = await tx.session.deleteMany({ where: { userId: user.id } });
      await writeAudit(tx, {
        actorId: user.id,
        action: 'PASSWORD_RESET_DONE',
        entityType: 'user',
        entityId: user.id,
        changes: { sessionsRevoked: { from: count, to: 0 } },
      });
      return this.createSession(tx, updated, userAgent);
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  /** null для отсутствующего, неверного или истёкшего токена. */
  async resolveSession(token: string): Promise<AuthContext | null> {
    if (!isWellFormedSessionToken(token)) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });
    const now = new Date();
    // Заблокированный аккаунт: сессии удаляются при блокировке, проверка — на случай гонки.
    if (!session || session.expiresAt <= now || session.user.blockedAt) return null;
    if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_STEP_MS) {
      // Не ждём и не роняем запрос: это только отметка для списка устройств.
      void this.prisma.session
        .updateMany({ where: { id: session.id }, data: { lastSeenAt: now } })
        .catch(() => undefined);
    }
    return { user: session.user, sessionId: session.id };
  }

  /** Новая сессия пользователя (вход по паролю или через банк, oauth/oauth.service.ts). */
  async createSession(
    db: Prisma.TransactionClient,
    user: User,
    userAgent?: string,
  ): Promise<AuthSessionDto> {
    const token = generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expiresAt,
        device: deviceLabel(userAgent),
        lastSeenAt: now,
      },
    });
    return { user: toUserDto(user), token, expiresAt: expiresAt.toISOString() };
  }
}
