import { LOGIN_THROTTLE } from '@agregator/shared';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;
/** Использованные и просроченные ссылки сброса хранятся неделю (видно, что ссылка была). */
const RESET_KEEP_MS = 7 * DAY_MS;

export interface CleanupResult {
  sessions: number;
  passwordResets: number;
  loginFailures: number;
}

/**
 * Очистка по расписанию (release gate, docs/SECURITY.md, п. 5): истёкшие сессии, старые
 * ссылки сброса пароля, закончившиеся серии неверных паролей. Раньше истёкшие сессии
 * удалялись только при входе их владельца. Раз в CLEANUP_INTERVAL_MIN минут (по умолчанию
 * 60; 0 — выключено). Удаления идемпотентны: несколько экземпляров API друг другу не мешают.
 */
@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Cleanup');
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const minutes = Number(process.env.CLEANUP_INTERVAL_MIN ?? 60);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    this.timer = setInterval(() => void this.runSafely(), minutes * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<CleanupResult> {
    const resetsBefore = new Date(now.getTime() - RESET_KEEP_MS);
    const failuresBefore = new Date(now.getTime() - LOGIN_THROTTLE.WINDOW_MIN * 60_000);
    const [sessions, passwordResets, loginFailures] = await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.prisma.passwordReset.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: resetsBefore } }, { usedAt: { lt: resetsBefore } }],
        },
      }),
      this.prisma.loginFailure.deleteMany({ where: { lastAt: { lt: failuresBefore } } }),
    ]);
    return {
      sessions: sessions.count,
      passwordResets: passwordResets.count,
      loginFailures: loginFailures.count,
    };
  }

  private async runSafely(): Promise<void> {
    try {
      const done = await this.run();
      if (done.sessions + done.passwordResets + done.loginFailures > 0) {
        this.logger.log(
          `removed: sessions ${done.sessions}, reset links ${done.passwordResets}, login failure series ${done.loginFailures}`,
        );
      }
    } catch (error) {
      this.logger.warn(`cleanup failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}
