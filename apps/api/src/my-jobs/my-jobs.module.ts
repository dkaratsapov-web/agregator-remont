import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MyJobsController } from './my-jobs.controller';
import { MyJobsService } from './my-jobs.service';

@Module({
  imports: [AuthModule],
  controllers: [MyJobsController],
  providers: [MyJobsService],
})
export class MyJobsModule {}
