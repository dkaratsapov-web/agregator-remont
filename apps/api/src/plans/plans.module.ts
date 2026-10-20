import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PhotosModule } from '../photos/photos.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [AuthModule, PhotosModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
