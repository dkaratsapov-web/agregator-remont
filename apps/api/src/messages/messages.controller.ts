import { PHOTO_LIMITS, type JobMessagesDto } from '@agregator/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { JobMessagesSchema } from '../openapi/schemas';
import { photoUpload } from '../photos/photo-upload';
import type { UploadedPhoto } from '../photos/photos.service';
import { ListMessagesQuery, SendMessageDto } from './dto/message.dto';
import { MessagesService } from './messages.service';

/** Переписка по заказу: заказчик-владелец и выбранный исполнитель; остальным — 404. */
@ApiTags('messages')
@ApiSession()
@ApiErrors(429)
@Controller('v1/jobs/:jobId/messages')
@UseGuards(SessionGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @ApiOkResponse({ type: JobMessagesSchema })
  @ApiErrors(400, 404)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Query() query: ListMessagesQuery,
  ): Promise<JobMessagesDto> {
    return this.messages.list(auth.user.id, jobId, query.before);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @UseInterceptors(photoUpload())
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        body: { type: 'string', maxLength: 2000 },
        requestId: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,64}$' },
        photos: {
          type: 'array',
          maxItems: PHOTO_LIMITS.PER_UPLOAD,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOkResponse({ type: JobMessagesSchema })
  @ApiErrors(400, 404, 409, 413)
  send(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: SendMessageDto,
    @UploadedFiles() files: UploadedPhoto[] | undefined,
  ): Promise<JobMessagesDto> {
    return this.messages.send(auth.user.id, jobId, dto, files);
  }
}
