import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BidsModule } from '../bids/bids.module';
import { DraftsController } from './drafts.controller';
import { DraftsService } from './drafts.service';
import { MyJobsController } from './my-jobs.controller';
import { MyJobsService } from './my-jobs.service';

@Module({
  imports: [AuthModule, BidsModule],
  controllers: [MyJobsController, DraftsController],
  providers: [MyJobsService, DraftsService],
})
export class MyJobsModule {}
