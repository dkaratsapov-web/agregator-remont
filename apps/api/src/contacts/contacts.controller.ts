import type { ContactExchangeDto } from '@agregator/shared';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { WriteRateLimited } from '../auth/rate-limit';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import { ContactExchangeSchema } from '../openapi/schemas';
import { ContactsService } from './contacts.service';

/**
 * Обмен контактами в сделке: заказчик-владелец и выбранный исполнитель открывают друг другу
 * свои телефон и email. Кто сторона, решают данные сделки; всем остальным — 404.
 */
@ApiTags('contacts')
@ApiSession()
@ApiErrors(429)
@Controller('v1/jobs/:jobId/contacts')
@UseGuards(SessionGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @ApiOkResponse({ type: ContactExchangeSchema })
  @ApiErrors(404)
  state(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<ContactExchangeDto> {
    return this.contacts.state(auth.user.id, jobId);
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({
    type: ContactExchangeSchema,
    description: 'Мои контакты открыты второй стороне',
  })
  @ApiErrors(404)
  share(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<ContactExchangeDto> {
    return this.contacts.setShared(auth.user.id, jobId, true);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: ContactExchangeSchema, description: 'Мои контакты снова скрыты' })
  @ApiErrors(404)
  hide(
    @CurrentAuth() auth: AuthContext,
    @Param('jobId') jobId: string,
  ): Promise<ContactExchangeDto> {
    return this.contacts.setShared(auth.user.id, jobId, false);
  }
}
