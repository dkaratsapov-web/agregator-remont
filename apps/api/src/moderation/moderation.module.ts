import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModerationController, ReportsController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule],
  controllers: [ReportsController, AdminModerationController],
  providers: [ReportsService, ModerationService],
})
export class ModerationModule {}
