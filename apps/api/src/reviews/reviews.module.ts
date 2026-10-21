import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContractorsPublicController, JobReviewController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [AuthModule],
  controllers: [JobReviewController, ContractorsPublicController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
