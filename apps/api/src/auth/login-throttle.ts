import { LOGIN_THROTTLE, loginDelaySeconds } from '@agregator/shared';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';

const WINDOW_MS = LOGIN_THROTTLE.WINDOW_MIN * 60_000;

/** Ключ серии: SHA-256 адреса в нижнем регистре (сам адрес не хранится). */
export function loginKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/**
 * Защита от перебора пароля к одному адресу (release gate, docs/SECURITY.md, п. 2). Работает
 * одинаково для существующих и несуществующих адресов, чтобы ответ не раскрывал регистрацию.
 */
export class LoginThrottle {
  constructor(private readonly prisma: PrismaService) {}

  /** Сколько секунд ещё ждать перед попыткой (0 — можно сейчас). */
  async wait(key: string, now = new Date()): Promise<number> {
    const row = await this.prisma.loginFailure.findUnique({ where: { emailHash: key } });
    if (!row || now.getTime() - row.lastAt.getTime() > WINDOW_MS) return 0;
    const delay = loginDelaySeconds(row.failures) * 1000;
    const left = row.lastAt.getTime() + delay - now.getTime();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  /** +1 к серии; серия старше окна начинается заново. Одним запросом, без гонки. */
  async fail(key: string, now = new Date()): Promise<void> {
    const windowStart = new Date(now.getTime() - WINDOW_MS);
    await this.prisma.$executeRaw`
      INSERT INTO login_failures (email_hash, failures, last_at) VALUES (${key}, 1, ${now})
      ON CONFLICT (email_hash) DO UPDATE SET
        failures = CASE WHEN login_failures.last_at < ${windowStart} THEN 1
                        ELSE login_failures.failures + 1 END,
        last_at = ${now}`;
  }

  /** Верный пароль — серия закончилась. */
  async clear(key: string): Promise<void> {
    await this.prisma.loginFailure.deleteMany({ where: { emailHash: key } });
  }
}
