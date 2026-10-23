import {
  ACCOUNT_LIMITS,
  type AccountExportDto,
  type SessionDto,
  type UserDto,
} from '@agregator/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { AuthRateLimited, WriteRateLimited } from '../auth/rate-limit';
import { SessionGuard } from '../auth/session.guard';
import { ApiErrors, ApiSession } from '../openapi/decorators';
import {
  AccountExportSchema,
  SessionSchema,
  SessionsRevokedSchema,
  UserSchema,
} from '../openapi/schemas';
import { AccountDataService } from './account-data.service';
import { AccountService } from './account.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toUserDto } from './user.mapper';

/** Личный кабинет текущего пользователя. Всё только для себя: id берётся из сессии. */
@ApiTags('me')
@ApiErrors(429)
@ApiSession()
@Controller('v1/me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    private readonly account: AccountService,
    private readonly data: AccountDataService,
  ) {}

  @Get()
  @ApiOkResponse({ type: UserSchema })
  me(@CurrentAuth() auth: AuthContext): UserDto {
    return toUserDto(auth.user);
  }

  @Patch()
  @WriteRateLimited()
  @ApiOkResponse({ type: UserSchema })
  @ApiErrors(400)
  updateProfile(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateProfileDto): Promise<UserDto> {
    return this.account.updateProfile(auth.user, dto);
  }

  @Patch('preferences')
  @WriteRateLimited()
  @ApiOkResponse({ type: UserSchema })
  @ApiErrors(400)
  updatePreferences(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<UserDto> {
    return this.account.updatePreferences(auth.user, dto);
  }

  /** Строгий лимит как у входа: перебор текущего пароля через смену не должен быть дешевле. */
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuthRateLimited()
  @ApiNoContentResponse({ description: 'Пароль изменён, остальные сеансы завершены' })
  @ApiErrors(400)
  changePassword(@CurrentAuth() auth: AuthContext, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.account.changePassword(auth.user, auth.sessionId, dto);
  }

  /**
   * Выгрузка своих данных одним JSON-файлом (152-ФЗ). Лимит записи: ответ собирается из
   * нескольких таблиц, и частые выгрузки не должны нагружать базу.
   */
  @Get('export')
  @WriteRateLimited()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AccountExportSchema })
  async export(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountExportDto> {
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="garantych-${auth.user.publicId}-${date}.json"`,
    );
    return this.data.export(auth.user);
  }

  /**
   * Удаление аккаунта по текущему паролю. Строгий лимит как у входа: подбор пароля через
   * удаление не дешевле, чем через вход. Во время заказа в работе — 409.
   */
  @Post('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuthRateLimited()
  @ApiNoContentResponse({ description: 'Аккаунт удалён, все сеансы завершены' })
  @ApiErrors(400, 409)
  delete(@CurrentAuth() auth: AuthContext, @Body() dto: DeleteAccountDto): Promise<void> {
    return this.data.delete(auth.user, auth.sessionId, dto.password);
  }

  @Get('sessions')
  @ApiOkResponse({ type: [SessionSchema] })
  sessions(@CurrentAuth() auth: AuthContext): Promise<SessionDto[]> {
    return this.account.listSessions(auth.user, auth.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @WriteRateLimited()
  @ApiNoContentResponse({ description: 'Сеанс завершён' })
  @ApiErrors(400, 404)
  revokeSession(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    return this.account.revokeSession(auth.user, auth.sessionId, id);
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @WriteRateLimited()
  @ApiOkResponse({ type: SessionsRevokedSchema })
  async revokeOthers(@CurrentAuth() auth: AuthContext): Promise<{ revoked: number }> {
    return { revoked: await this.account.revokeOtherSessions(auth.user, auth.sessionId) };
  }

  @Get('avatar')
  @Header('Content-Type', 'image/webp')
  @Header('Cache-Control', 'private, no-cache')
  @ApiOkResponse({
    description: 'Фото профиля (WebP 512×512)',
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiErrors(404)
  async avatar(@CurrentAuth() auth: AuthContext): Promise<StreamableFile> {
    return new StreamableFile(await this.account.getAvatar(auth.user));
  }

  /** Файл в памяти, не больше 5 МБ; формат проверяется по содержимому при перекодировании. */
  @Put('avatar')
  @WriteRateLimited()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ACCOUNT_LIMITS.AVATAR_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: UserSchema })
  @ApiErrors(400, 413)
  setAvatar(
    @CurrentAuth() auth: AuthContext,
    @UploadedFile() file: { buffer?: Buffer } | undefined,
  ): Promise<UserDto> {
    if (!file?.buffer?.length) throw new BadRequestException('Выберите файл с фото');
    return this.account.setAvatar(auth.user, file.buffer);
  }

  @Delete('avatar')
  @WriteRateLimited()
  @ApiOkResponse({ type: UserSchema })
  deleteAvatar(@CurrentAuth() auth: AuthContext): Promise<UserDto> {
    return this.account.deleteAvatar(auth.user);
  }
}
