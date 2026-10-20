import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import {
  AUTH_THROTTLER,
  isAuthRateLimited,
  isWriteRateLimited,
  WRITE_THROTTLER,
} from './auth/rate-limit';
import { loadRateLimits } from './config/env';
import { HealthController } from './health/health.controller';
import { JobsModule } from './jobs/jobs.module';
import { BidsModule } from './bids/bids.module';
import { ContractorsModule } from './contractors/contractors.module';
import { LeadsModule } from './leads/leads.module';
import { MyJobsModule } from './my-jobs/my-jobs.module';
import { OAuthModule } from './oauth/oauth.module';
import { MessagesModule } from './messages/messages.module';
import { ModerationModule } from './moderation/moderation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PhotosModule } from './photos/photos.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Счётчики в памяти процесса: корректно только для одного инстанса API (docs/SECURITY.md).
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const limits = loadRateLimits();
        return [
          { name: 'default', ttl: 60_000, limit: limits.perMinute },
          {
            name: AUTH_THROTTLER,
            ttl: 60_000,
            limit: limits.authPerMinute,
            // Строгий лимит действует только на маршруты с @AuthRateLimited().
            skipIf: (context) => !isAuthRateLimited(context),
          },
          {
            name: WRITE_THROTTLER,
            ttl: 60_000,
            limit: limits.writePerMinute,
            skipIf: (context) => !isWriteRateLimited(context),
          },
        ];
      },
    }),
    PrismaModule,
    JobsModule,
    AuthModule,
    MyJobsModule,
    BidsModule,
    ContractorsModule,
    LeadsModule,
    OAuthModule,
    PlansModule,
    MessagesModule,
    NotificationsModule,
    ModerationModule,
    PhotosModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
