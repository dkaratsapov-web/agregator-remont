import type { FavoriteIdsDto, FavoriteStateDto, JobDto, Paginated } from '@agregator/shared';
import { Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { SessionGuard } from '../auth/session.guard';
import { PaginationQuery } from '../jobs/dto/list-jobs.query';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { FavoriteIdsSchema, FavoriteStateSchema, PaginatedJobSchema } from '../openapi/schemas';
import { FavoritesService } from './favorites.service';

@ApiTags('favorites')
@ApiSession()
@ApiErrors(429)
@Controller('v1/me/favorites')
@UseGuards(SessionGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOkResponse({ type: PaginatedJobSchema, description: 'Избранные заказы, новые первыми' })
  @ApiErrors(400)
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PaginationQuery,
  ): Promise<Paginated<JobDto>> {
    return this.favorites.list(auth.user.id, query.page);
  }

  @Get('ids')
  @ApiOkResponse({ type: FavoriteIdsSchema })
  ids(@CurrentAuth() auth: AuthContext): Promise<FavoriteIdsDto> {
    return this.favorites.ids(auth.user.id);
  }

  @Put(':jobId')
  @WriteRateLimited()
  @ApiOkResponse({ type: FavoriteStateSchema })
  @ApiErrors(404, 409)
  add(@CurrentAuth() auth: AuthContext, @Param('jobId') jobId: string): Promise<FavoriteStateDto> {
    return this.favorites.add(auth.user.id, jobId);
  }

  @Delete(':jobId')
  @WriteRateLimited()
  @ApiOkResponse({ type: FavoriteStateSchema })
  @ApiErrors(404)
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<FavoriteStateDto> {
    return this.favorites.remove(auth.user.id, jobId);
  }
}
