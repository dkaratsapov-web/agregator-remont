import type { UsageCounter } from '@agregator/shared';
import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

const logger = new Logger('Usage');
/** Москва живёт по UTC+3 без перехода на летнее время (с 2014 года). */
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** День по Москве для момента `at`: YYYY-MM-DD. */
export function mskDay(at: Date): string {
  return new Date(at.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * +1 к счётчику за сегодня (по Москве). Отдельным запросом вне транзакций: сбой счётчика не
 * должен ломать действие человека, поэтому ошибка только пишется в журнал приложения.
 */
export async function countUsage(prisma: PrismaService, metric: UsageCounter): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO usage_counters (day, metric, count)
      VALUES (${mskDay(new Date())}::date, ${metric}, 1)
      ON CONFLICT (day, metric) DO UPDATE SET count = usage_counters.count + 1`;
  } catch (error) {
    logger.warn(`counter ${metric} not saved: ${error instanceof Error ? error.message : error}`);
  }
}
