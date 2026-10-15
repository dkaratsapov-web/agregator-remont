import type { AuthSessionDto } from '@agregator/shared';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto } from '../users/user.mapper';
import type { AuthContext } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import {
  generateSessionToken,
  hashSessionToken,
  isWellFormedSessionToken,
  SESSION_TTL_MS,
} from './session-token';

const INVALID_CREDENTIALS = 'Неверный email или пароль';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<AuthSessionDto> {
    if (dto.password.toLowerCase() === dto.email) {
      throw new ConflictException('Пароль не должен совпадать с email');
    }
    const passwordHash = await hashPassword(dto.password);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: { email: dto.email, passwordHash, name: dto.name, role: dto.role },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Пользователь с таким email уже зарегистрирован');
      }
      throw error;
    }
    return this.createSession(user);
  }

  async login(dto: LoginDto): Promise<AuthSessionDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Пароль проверяется и для несуществующего email, чтобы не раскрывать его по времени ответа.
    const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    await this.prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lte: new Date() } },
    });
    return this.createSession(user);
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
    if (!session || session.expiresAt <= new Date()) return null;
    return { user: session.user, sessionId: session.id };
  }

  private async createSession(user: User): Promise<AuthSessionDto> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt },
    });
    return { user: toUserDto(user), token, expiresAt: expiresAt.toISOString() };
  }
}
