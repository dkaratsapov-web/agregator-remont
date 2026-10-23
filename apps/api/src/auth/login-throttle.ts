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

  /**
   * Занять попытку до проверки пароля: 0 — можно проверять, попытка уже записана в серию как
   * неверная (верный пароль затем вызывает `clear`); иначе — сколько секунд ждать.
   *
   * Проверка паузы и запись попытки — один запрос под блокировкой строки серии. Поэтому пачка
   * одновременных запросов в момент окончания паузы проверяет пароль один раз, а не каждый
   * запрос пачки. Формула паузы — та же, что в `loginDelaySeconds`.
   */
  async attempt(key: string, now = new Date()): Promise<number> {
    const windowStart = new Date(now.getTime() - WINDOW_MS);
    const { FREE_FAILURES, BASE_DELAY_S, MAX_DELAY_S } = LOGIN_THROTTLE;
    const taken = await this.prisma.$queryRaw<{ failures: number }[]>`
      INSERT INTO login_failures (email_hash, failures, last_at) VALUES (${key}, 1, ${now})
      ON CONFLICT (email_hash) DO UPDATE SET
        failures = CASE WHEN login_failures.last_at < ${windowStart} THEN 1
                        ELSE login_failures.failures + 1 END,
        last_at = ${now}
      WHERE login_failures.last_at < ${windowStart}
         OR login_failures.failures < ${FREE_FAILURES}::int
         OR login_failures.last_at + make_interval(secs => LEAST(${MAX_DELAY_S}::int,
              ${BASE_DELAY_S}::int * power(2, LEAST(login_failures.failures - ${FREE_FAILURES}::int, 10))
            )) <= ${now}
      RETURNING failures`;
    if (taken.length > 0) return 0;
    // Отказ: пауза ещё идёт. Не меньше секунды, даже если она кончилась между запросами.
    return Math.max(1, await this.wait(key, now));
  }

  /** Верный пароль — серия закончилась. */
  async clear(key: string): Promise<void> {
    await this.prisma.loginFailure.deleteMany({ where: { emailHash: key } });
  }
}
