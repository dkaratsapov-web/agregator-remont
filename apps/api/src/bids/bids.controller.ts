import type { JobBidDto, MyBidDto, Paginated } from '@agregator/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { BidsService } from './bids.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { PaginationQuery } from '../jobs/dto/list-jobs.query';
import { ListMyBidsQuery } from './dto/list-my-bids.query';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors, ApiRole } from '../openapi/decorators';
import {
  JobBidSchema,
  MyBidSchema,
  PaginatedJobBidSchema,
  PaginatedMyBidSchema,
} from '../openapi/schemas';

/** Отклик на заказ: только подрядчик. */
@ApiTags('bids')
@ApiErrors(429)
@ApiRole()
@Controller('v1/jobs/:jobId/bids')
@UseGuards(SessionGuard, RolesGuard)
@Roles('CONTRACTOR')
export class JobBidsController {
  constructor(private readonly bids: BidsService) {}

  @Post()
  @WriteRateLimited()
  @ApiCreatedResponse({ type: MyBidSchema })
  @ApiErrors(400, 404, 409)
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Body() dto: CreateBidDto,
  ): Promise<MyBidDto> {
    return this.bids.create(auth.user.id, jobId, dto);
  }
}

/** Свои отклики подрядчика. */
@ApiTags('bids')
@ApiErrors(429)
@ApiRole()
@Controller('v1/me/bids')
@UseGuards(SessionGuard, RolesGuard)
@Roles('CONTRACTOR')
export class MyBidsController {
  constructor(private readonly bids: BidsService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedMyBidSchema })
  @ApiErrors(400)
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ListMyBidsQuery,
  ): Promise<Paginated<MyBidDto>> {
    return this.bids.listMine(auth.user.id, query);
  }

  @Post(':bidId/withdraw')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: MyBidSchema })
  @ApiErrors(404, 409)
  withdraw(@CurrentAuth() auth: AuthContext, @Param('bidId') bidId: string): Promise<MyBidDto> {
    return this.bids.withdraw(auth.user.id, bidId);
  }
}

/** Отклики на свой заказ: только заказчик-владелец. */
@ApiTags('bids')
@ApiErrors(429)
@ApiRole()
@Controller('v1/me/jobs/:jobId/bids')
@UseGuards(SessionGuard, RolesGuard)
@Roles('CUSTOMER')
export class OwnerBidsController {
  constructor(private readonly bids: BidsService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedJobBidSchema })
  @ApiErrors(400, 404)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Query() query: PaginationQuery,
  ): Promise<Paginated<JobBidDto>> {
    return this.bids.listForOwner(auth.user.id, jobId, query);
  }

  @Post(':bidId/accept')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: JobBidSchema })
  @ApiErrors(404, 409)
  accept(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
    @Param('bidId') bidId: string,
  ): Promise<JobBidDto> {
    return this.bids.accept(auth.user.id, jobId, bidId);
  }
}
