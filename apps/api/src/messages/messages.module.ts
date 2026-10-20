import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PhotosModule } from '../photos/photos.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [AuthModule, PhotosModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
