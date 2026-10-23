import type { UsageCounter } from '@agregator/shared';
import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Москва живёт по UTC+3 без перехода на летнее время (с 2014 года). */
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const FLUSH_MS = 30_000;

/** День по Москве для момента `at`: YYYY-MM-DD. */
export function mskDay(at: Date): string {
  return new Date(at.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Счётчики без персональных данных (docs/ANALYTICS.md). Копятся в памяти и пишутся в базу
 * одним запросом раз в 30 секунд и при остановке: публичные GET (каталог, карточка) не
 * превращаются в запись в базу на каждый запрос. При аварийном падении теряются только
 * последние секунды — для приблизительных счётчиков это допустимо. Ошибка записи не ломает
 * действие человека: пишется предупреждение, несохранённое возвращается в очередь.
 */
@Injectable()
export class UsageCounters implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Usage');
  private pending = new Map<string, number>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  /** Последний сброс при остановке. Не удался — числа теряются, и это видно в журнале. */
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
    if (this.pending.size > 0) {
      const lost = [...this.pending.values()].reduce((sum, n) => sum + n, 0);
      this.logger.error(`counters lost at shutdown: ${lost}`);
      this.pending.clear();
    }
  }

  /** +1 к счётчику за сегодня (по Москве); в базу — при следующем сбросе. */
  add(metric: UsageCounter, at = new Date()): void {
    const key = `${mskDay(at)}|${metric}`;
    this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
  }

  /** Записать накопленное одним запросом. */
  async flush(): Promise<void> {
    if (this.pending.size === 0) return;
    const batch = this.pending;
    this.pending = new Map();
    const rows = [...batch].map(([key, count]) => {
      const [day, metric] = key.split('|');
      return Prisma.sql`(${day}::date, ${metric}, ${count})`;
    });
    try {
      await this.prisma.$executeRaw`
        INSERT INTO usage_counters (day, metric, count) VALUES ${Prisma.join(rows)}
        ON CONFLICT (day, metric) DO UPDATE SET count = usage_counters.count + EXCLUDED.count`;
    } catch (error) {
      for (const [key, count] of batch) this.pending.set(key, (this.pending.get(key) ?? 0) + count);
      this.logger.warn(`counters not saved: ${error instanceof Error ? error.message : error}`);
    }
  }
}

/** Доступен всем модулям: счётчики добавляются из каталога, карточки и черновиков. */
@Global()
@Module({ providers: [UsageCounters], exports: [UsageCounters] })
export class UsageModule {}
