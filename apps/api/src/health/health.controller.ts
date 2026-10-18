import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../openapi/decorators';
import { HealthSchema } from '../openapi/schemas';
import { PrismaService } from '../prisma/prisma.service';

/** Сколько ждём ответа базы в проверке готовности. */
const READY_TIMEOUT_MS = 2000;

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Процесс жив (без базы): для быстрой проверки, что API отвечает. */
  @Get()
  @SkipThrottle()
  @ApiOkResponse({ type: HealthSchema })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Готовность: API отвечает и база доступна (SELECT 1 за 2 с). По ней Docker считает контейнер
   * api здоровым, а автообновление — что новая версия работает (AUDIT_FINDINGS DEV-10).
   */
  @Get('ready')
  @SkipThrottle()
  @ApiOkResponse({ type: HealthSchema })
  @ApiErrors(503)
  async ready(): Promise<{ status: 'ok' }> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), READY_TIMEOUT_MS);
        }),
      ]);
    } catch {
      throw new ServiceUnavailableException('База данных недоступна');
    } finally {
      clearTimeout(timer);
    }
    return { status: 'ok' };
  }
}
