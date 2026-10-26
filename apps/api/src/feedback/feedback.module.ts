import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminFeedbackController, MyFeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [AuthModule],
  controllers: [MyFeedbackController, AdminFeedbackController],
  providers: [FeedbackService],
})
export class FeedbackModule {}
