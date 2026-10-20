import type { JobDraftDto } from '@agregator/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { Roles, RolesGuard } from '../auth/roles';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiRole } from '../openapi/decorators';
import { JobDraftListSchema, JobDraftSchema } from '../openapi/schemas';
import { DraftsService } from './drafts.service';
import { SaveDraftDto } from './dto/draft-input.dto';

/** Черновики нового заказа. Публикация — POST /v1/me/jobs с draftId (полная проверка). */
@ApiTags('my-drafts')
@ApiErrors(429)
@ApiRole()
@Controller('v1/me/drafts')
@UseGuards(SessionGuard, RolesGuard)
@Roles('CUSTOMER')
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Get()
  @ApiOkResponse({ type: JobDraftListSchema })
  async list(@CurrentAuth() auth: AuthContext): Promise<{ items: JobDraftDto[] }> {
    return { items: await this.drafts.list(auth.user.id) };
  }

  @Get(':id')
  @ApiOkResponse({ type: JobDraftSchema })
  @ApiErrors(404)
  get(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<JobDraftDto> {
    return this.drafts.get(auth.user.id, id);
  }

  @Post()
  @WriteRateLimited()
  @ApiCreatedResponse({ type: JobDraftSchema })
  @ApiErrors(400, 409)
  create(@CurrentAuth() auth: AuthContext, @Body() dto: SaveDraftDto): Promise<JobDraftDto> {
    return this.drafts.create(auth.user.id, dto);
  }

  @Put(':id')
  @WriteRateLimited()
  @ApiOkResponse({ type: JobDraftSchema })
  @ApiErrors(400, 404, 409)
  replace(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
  ): Promise<JobDraftDto> {
    return this.drafts.replace(auth.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @WriteRateLimited()
  @ApiNoContentResponse()
  @ApiErrors(404)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    await this.drafts.remove(auth.user.id, id);
  }
}
