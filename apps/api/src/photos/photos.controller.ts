import { PHOTO_SIZES, type PhotoSize } from '@agregator/shared';
import { Controller, Get, Header, Param, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { PhotosService } from './photos.service';

export class PhotoQueryDto {
  @IsOptional()
  @IsIn(PHOTO_SIZES, { message: 'Размер фото: thumb или full' })
  @ApiProperty({ enum: PHOTO_SIZES, required: false, default: 'full' })
  size: PhotoSize = 'full';
}

/** Фото к сообщениям и сдаче этапов: только сторонам сделки и администратору. */
@ApiTags('photos')
@ApiSession()
@Controller('v1/jobs/:jobId/photos')
@UseGuards(SessionGuard)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  /** Содержимое фото по id не меняется: браузер может хранить его в своём кеше. */
  @Get(':photoId')
  @Header('Content-Type', 'image/webp')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @ApiOkResponse({
    description: 'Фото (WebP): полное до 2000 px или миниатюра до 480 px',
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiErrors(400, 404)
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Param('photoId') photoId: string,
    @Query() query: PhotoQueryDto,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.photos.read(auth.user, jobId, photoId, query.size));
  }
}
