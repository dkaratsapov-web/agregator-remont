import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BidsModule } from '../bids/bids.module';
import { MyJobsController } from './my-jobs.controller';
import { MyJobsService } from './my-jobs.service';

@Module({
  imports: [AuthModule, BidsModule],
  controllers: [MyJobsController],
  providers: [MyJobsService],
})
export class MyJobsModule {}
