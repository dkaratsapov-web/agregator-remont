import type { JobPlanDto } from '@agregator/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PHOTO_LIMITS } from '@agregator/shared';
import {
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { JobPlanSchema } from '../openapi/schemas';
import { photoUpload } from '../photos/photo-upload';
import { PhotosService, type UploadedPhoto } from '../photos/photos.service';
import {
  PlanAuthorDto,
  PlanCommentDto,
  PlanVersionDto,
  QuitJobDto,
  ReturnPlanDto,
  SavePlanDto,
} from './dto/plan.dto';
import { PlansService } from './plans.service';

/**
 * План работ и этапы заказа в работе: заказчик-владелец и выбранный исполнитель. Кто что
 * может, определяют данные сделки (владелец, выбранный отклик, составитель плана), а не роль
 * учётной записи; всем остальным — 404.
 */
@ApiTags('plans')
@ApiSession()
@ApiErrors(429)
@Controller('v1/jobs/:jobId')
@UseGuards(SessionGuard)
export class PlansController {
  constructor(
    private readonly plans: PlansService,
    private readonly photos: PhotosService,
  ) {}

  @Get('plan')
  @ApiOkResponse({ type: JobPlanSchema })
  @ApiErrors(404)
  get(@CurrentAuth() auth: AuthContext, @Param('jobId') jobId: string): Promise<JobPlanDto> {
    return this.plans.get(auth.user.id, jobId);
  }

  @Put('plan')
  @WriteRateLimited()
  @ApiOkResponse({ type: JobPlanSchema })
  @ApiErrors(400, 403, 404, 409)
  save(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: SavePlanDto,
  ): Promise<JobPlanDto> {
    return this.plans.save(auth.user.id, jobId, dto);
  }

  @Post('plan/author')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: JobPlanSchema })
  @ApiErrors(400, 403, 404, 409)
  setAuthor(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: PlanAuthorDto,
  ): Promise<JobPlanDto> {
    return this.plans.setAuthor(auth.user.id, jobId, dto);
  }

  @Post('plan/propose')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: JobPlanSchema })
  @ApiErrors(400, 403, 404, 409)
  propose(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: PlanVersionDto,
  ): Promise<JobPlanDto> {
    return this.plans.propose(auth.user.id, jobId, dto);
  }

  @Post('plan/approve')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: JobPlanSchema })
  @ApiErrors(400, 403, 404, 409)
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: PlanVersionDto,
  ): Promise<JobPlanDto> {
    return this.plans.approve(auth.user.id, jobId, dto);
  }

  @Post('plan/return')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: JobPlanSchema })
  @ApiErrors(400, 403, 404, 409)
  returnPlan(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: ReturnPlanDto,
  ): Promise<JobPlanDto> {
    return this.plans.returnPlan(auth.user.id, jobId, dto);
  }

  /** Сдача этапа: комментарий и фото-отчёт (multipart, поле photos) или только комментарий (JSON). */
  @Post('stages/:stageId/submit')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @UseInterceptors(photoUpload())
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['comment'],
      properties: {
        comment: { type: 'string', minLength: 5, maxLength: 1000 },
        photos: {
          type: 'array',
          maxItems: PHOTO_LIMITS.PER_UPLOAD,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOkResponse({ type: JobPlanSchema })
  @ApiErrors(400, 403, 404, 409, 413)
  async submit(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Param('stageId') stageId: string,
    @Body() dto: PlanCommentDto,
    @UploadedFiles() files: UploadedPhoto[] | undefined,
  ): Promise<JobPlanDto> {
    // Перекодирование фото — тяжёлая работа: сначала проверка, что сдаёт исполнитель сделки.
    if (files?.length) await this.plans.assertContractor(auth.user.id, jobId);
    const photos = await this.photos.prepare(files);
    return this.plans.submitStage(auth.user.id, jobId, stageId, dto, photos);
  }

  @Post('stages/:stageId/accept')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: JobPlanSchema })
  @ApiErrors(403, 404, 409)
  accept(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Param('stageId') stageId: string,
  ): Promise<JobPlanDto> {
    return this.plans.acceptStage(auth.user.id, jobId, stageId);
  }

  @Post('stages/:stageId/rework')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: JobPlanSchema })
  @ApiErrors(400, 403, 404, 409)
  rework(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Param('stageId') stageId: string,
    @Body() dto: PlanCommentDto,
  ): Promise<JobPlanDto> {
    return this.plans.reworkStage(auth.user.id, jobId, stageId, dto);
  }

  /** Отказ выбранного исполнителя: заказ снова открыт. */
  @Post('quit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @WriteRateLimited()
  @ApiNoContentResponse({ description: 'Исполнитель отказался, заказ снова открыт' })
  @ApiErrors(400, 403, 404, 409)
  quit(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: QuitJobDto,
  ): Promise<void> {
    return this.plans.quit(auth.user.id, jobId, dto);
  }
}
