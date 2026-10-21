import type { JobReviewStateDto, PublicContractorDto, ReviewDto } from '@agregator/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiRole } from '../openapi/decorators';
import { JobReviewStateSchema, PublicContractorSchema, ReviewSchema } from '../openapi/schemas';
import { ContractorReviewsQuery, CreateReviewDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

/** Отзыв заказчика по своему выполненному заказу. */
@ApiTags('reviews')
@ApiErrors(429)
@ApiRole()
@Controller('v1/me/jobs/:jobId/review')
@UseGuards(SessionGuard, RolesGuard)
@Roles('CUSTOMER')
export class JobReviewController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOkResponse({ type: JobReviewStateSchema })
  @ApiErrors(404)
  state(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<JobReviewStateDto> {
    return this.reviews.state(auth.user.id, jobId);
  }

  @Post()
  @WriteRateLimited()
  @ApiCreatedResponse({ type: ReviewSchema })
  @ApiErrors(400, 404, 409)
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.create(auth.user.id, jobId, dto);
  }
}

/** Публичная карточка мастера: профиль, рейтинг и отзывы, без контактов. */
@ApiTags('contractors')
@ApiErrors(429)
@Controller('v1/contractors')
export class ContractorsPublicController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':publicId')
  @ApiOkResponse({ type: PublicContractorSchema })
  @ApiErrors(400, 404)
  get(
    @Param('publicId', new ParseIntPipe({ errorHttpStatusCode: 404 })) publicId: number,
    @Query() query: ContractorReviewsQuery,
  ): Promise<PublicContractorDto> {
    return this.reviews.contractor(publicId, query);
  }
}
