import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Базовая защита от перебора: 120 запросов в минуту на IP.
    // Счётчики в памяти процесса: корректно только для одного инстанса API (docs/SECURITY.md).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
