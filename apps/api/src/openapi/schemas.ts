import {
  BID_REJECT_REASONS,
  BID_STATUSES,
  CURRENCIES,
  JOB_CATEGORIES,
  JOB_CLOSE_OUTCOMES,
  JOB_STATUSES,
  UI_MOTIONS,
  UI_SCALES,
  UI_THEMES,
  USER_ROLES,
  type AuthSessionDto,
  type BidRejectReason,
  type BidStatus,
  type ContractorProfileDto,
  type Currency,
  type JobBidDto,
  type JobCategory,
  type JobCloseOutcome,
  type JobDetails,
  type JobDraftDto,
  type JobDto,
  type JobItemDto,
  type JobStatus,
  type LeadDto,
  type MyBidDto,
  type OwnJobDto,
  type Paginated,
  type SessionDto,
  type UiMotion,
  type UiPreferences,
  type UiScale,
  type UiTheme,
  type UserDto,
  type UserRole,
} from '@agregator/shared';
import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { jobDetailsProperty } from './job-details';

/**
 * Схемы ответов API для OpenAPI (ADR 0003). Каждый класс `implements` интерфейс из
 * @agregator/shared, поэтому расхождение описаний ломает typecheck; соответствие реальным
 * ответам проверяет test/contract.e2e-spec.ts. Правила: поле присутствует всегда (null вместо
 * пропуска), числа целые, даты — ISO 8601 (`date-time`), массивы не бывают null.
 */

const dateTime = (description?: string) =>
  ApiProperty({ type: String, format: 'date-time', description });
const int = (options: { nullable?: boolean; description?: string } = {}) =>
  ApiProperty({ type: 'integer', ...options });

@ApiSchema({ name: 'JobItemDto' })
export class JobItemSchema implements JobItemDto {
  @ApiProperty({ enum: JOB_CATEGORIES, enumName: 'JobCategory' }) category!: JobCategory;
  @ApiProperty(jobDetailsProperty('Ответы анкеты категории позиции'))
  details!: JobDetails;
}

@ApiSchema({ name: 'JobDto' })
export class JobSchema implements JobDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: JOB_CATEGORIES, enumName: 'JobCategory' }) category!: JobCategory;
  @ApiProperty() city!: string;
  @int({ nullable: true, description: 'Целые рубли; null — «по договорённости»' })
  budgetMin!: number | null;
  @int({ nullable: true, description: 'Целые рубли; null — «по договорённости»' })
  budgetMax!: number | null;
  @ApiProperty({ enum: CURRENCIES, enumName: 'Currency' }) currency!: Currency;
  @ApiProperty({ enum: JOB_STATUSES, enumName: 'JobStatus' }) status!: JobStatus;
  @ApiProperty(
    jobDetailsProperty(
      'Ответы анкеты категории { id вопроса: значение }; {} если анкета не заполнена',
    ),
  )
  details!: JobDetails;
  @ApiProperty({
    type: [JobItemSchema],
    description: 'Позиции других категорий (до 4); [] если категория одна',
  })
  extraItems!: JobItemSchema[];
  @dateTime() createdAt!: string;
}

@ApiSchema({ name: 'OwnJobDto' })
export class OwnJobSchema extends JobSchema implements OwnJobDto {
  @dateTime() updatedAt!: string;
  @ApiProperty({ description: 'Редактировать можно только открытый заказ' }) editable!: boolean;
  @ApiProperty({
    enum: JOB_CLOSE_OUTCOMES,
    enumName: 'JobCloseOutcome',
    nullable: true,
    description: 'Исход закрытого заказа; null — не закрыт или закрыт до появления поля',
  })
  closeOutcome!: JobCloseOutcome | null;
}

@ApiSchema({ name: 'JobDraftDto' })
export class JobDraftSchema implements JobDraftDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: JOB_CATEGORIES, enumName: 'JobCategory', nullable: true })
  category!: JobCategory | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @int({ nullable: true }) budgetMin!: number | null;
  @int({ nullable: true }) budgetMax!: number | null;
  @ApiProperty(jobDetailsProperty('Ответы анкеты, подходящие категории; {} без категории'))
  details!: JobDetails;
  @ApiProperty({ type: [JobItemSchema] }) extraItems!: JobItemSchema[];
  @dateTime() createdAt!: string;
  @dateTime() updatedAt!: string;
}

@ApiSchema({ name: 'JobDraftList' })
export class JobDraftListSchema {
  @ApiProperty({ type: [JobDraftSchema] }) items!: JobDraftSchema[];
}

@ApiSchema({ name: 'PaginatedJobDto' })
export class PaginatedJobSchema implements Paginated<JobDto> {
  @ApiProperty({ type: [JobSchema] }) items!: JobSchema[];
  @int() page!: number;
  @int() limit!: number;
  @int() total!: number;
}

@ApiSchema({ name: 'PaginatedOwnJobDto' })
export class PaginatedOwnJobSchema implements Paginated<OwnJobDto> {
  @ApiProperty({ type: [OwnJobSchema] }) items!: OwnJobSchema[];
  @int() page!: number;
  @int() limit!: number;
  @int() total!: number;
}

@ApiSchema({ name: 'UiPreferences' })
export class UiPreferencesSchema implements UiPreferences {
  @ApiProperty({ enum: UI_THEMES, enumName: 'UiTheme' }) theme!: UiTheme;
  @ApiProperty({ enum: UI_SCALES, enumName: 'UiScale' }) scale!: UiScale;
  @ApiProperty({ enum: UI_MOTIONS, enumName: 'UiMotion' }) motion!: UiMotion;
}

@ApiSchema({ name: 'UserDto' })
export class UserSchema implements UserDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: 'integer', minimum: 1, description: 'Короткий номер для поддержки' })
  publicId!: number;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: USER_ROLES, enumName: 'UserRole' }) role!: UserRole;
  @ApiProperty({ type: String, nullable: true, pattern: '^\\+7[3489][0-9]{9}$' })
  phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Версия фото для адреса картинки; null — фото нет',
  })
  avatarVersion!: string | null;
  @ApiProperty({ type: UiPreferencesSchema }) preferences!: UiPreferencesSchema;
  @dateTime() createdAt!: string;
}

@ApiSchema({ name: 'SessionDto' })
export class SessionSchema implements SessionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Например «Chrome, Windows»' })
  device!: string | null;
  @dateTime() createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) lastSeenAt!: string | null;
  @ApiProperty({ description: 'Сессия, с которой сделан запрос' }) current!: boolean;
}

@ApiSchema({ name: 'SessionsRevoked' })
export class SessionsRevokedSchema {
  @int({ description: 'Сколько сессий завершено' }) revoked!: number;
}

@ApiSchema({ name: 'AuthSessionDto' })
export class AuthSessionSchema implements AuthSessionDto {
  @ApiProperty({ type: UserSchema }) user!: UserSchema;
  @ApiProperty({ description: 'Непрозрачный токен сессии для Authorization: Bearer' })
  token!: string;
  @dateTime() expiresAt!: string;
}

@ApiSchema({ name: 'ContractorProfileDto' })
export class ContractorProfileSchema implements ContractorProfileDto {
  @ApiProperty() about!: string;
  @ApiProperty({ enum: JOB_CATEGORIES, enumName: 'JobCategory', isArray: true })
  categories!: JobCategory[];
  @ApiProperty({ type: [String] }) cities!: string[];
  @int({ nullable: true }) experienceYears!: number | null;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'null, если профиль ещё не заполнялся',
  })
  updatedAt!: string | null;
}

class BidFields {
  @ApiProperty() id!: string;
  @ApiProperty() jobId!: string;
  @ApiProperty({ enum: BID_STATUSES, enumName: 'BidStatus' }) status!: BidStatus;
  @int({ description: 'Целые рубли' }) price!: number;
  @int({ nullable: true }) durationDays!: number | null;
  @ApiProperty() comment!: string;
  @dateTime() createdAt!: string;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Когда заказчик изменил заказ после этого отклика; null — не менял',
  })
  jobChangedAt!: string | null;
  @ApiProperty({
    enum: BID_REJECT_REASONS,
    enumName: 'BidRejectReason',
    nullable: true,
    description: 'Почему отклик отклонён (только у REJECTED)',
  })
  rejectReason!: BidRejectReason | null;
}

@ApiSchema({ name: 'MyBidJob' })
export class MyBidJobSchema {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() city!: string;
  @ApiProperty({ enum: JOB_STATUSES, enumName: 'JobStatus' }) status!: JobStatus;
  @ApiProperty({ enum: JOB_CLOSE_OUTCOMES, enumName: 'JobCloseOutcome', nullable: true })
  closeOutcome!: JobCloseOutcome | null;
}

@ApiSchema({ name: 'MyBidDto' })
export class MyBidSchema extends BidFields implements MyBidDto {
  @ApiProperty({ type: MyBidJobSchema }) job!: MyBidJobSchema;
}

@ApiSchema({ name: 'PaginatedMyBidDto' })
export class PaginatedMyBidSchema implements Paginated<MyBidDto> {
  @ApiProperty({ type: [MyBidSchema] }) items!: MyBidSchema[];
  @int() page!: number;
  @int() limit!: number;
  @int() total!: number;
}

@ApiSchema({ name: 'BidContractor' })
export class BidContractorSchema {
  @ApiProperty() name!: string;
  @ApiProperty({ type: ContractorProfileSchema, nullable: true })
  profile!: ContractorProfileSchema | null;
}

@ApiSchema({ name: 'JobBidDto' })
export class JobBidSchema extends BidFields implements JobBidDto {
  @ApiProperty({ type: BidContractorSchema }) contractor!: BidContractorSchema;
}

@ApiSchema({ name: 'LeadDto' })
export class LeadSchema implements LeadDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ pattern: '^\\+7[3489][0-9]{9}$', example: '+79001234567' }) phone!: string;
  @dateTime() createdAt!: string;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'null — заявка ещё не обработана',
  })
  processedAt!: string | null;
}

@ApiSchema({ name: 'PaginatedLeadDto' })
export class PaginatedLeadSchema implements Paginated<LeadDto> {
  @ApiProperty({ type: [LeadSchema] }) items!: LeadSchema[];
  @int() page!: number;
  @int() limit!: number;
  @int() total!: number;
}

@ApiSchema({ name: 'LeadReceived' })
export class LeadReceivedSchema {
  @ApiProperty({ enum: [true] }) received!: true;
}

@ApiSchema({ name: 'Health' })
export class HealthSchema {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}

/**
 * Текущий формат ошибок NestJS (до ADR 0002 / PR C). `message` — строка или массив строк
 * (ошибки валидации); `error` есть не у всех исключений (например, у ответов throttler'а нет).
 */
@ApiSchema({ name: 'ErrorResponse' })
export class ErrorSchema {
  @int() statusCode!: number;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message!: string | string[];
  @ApiProperty({ required: false }) error?: string;
  @ApiProperty({
    required: false,
    description: 'Код ошибки для программы (вход через банк: OAUTH_*)',
  })
  code?: string;
}

@ApiSchema({ name: 'OAuthNeedRoleError' })
export class OAuthNeedRoleSchema extends ErrorSchema {
  @ApiProperty({ description: 'Незавершённый вход: вернуть в /v1/auth/oauth/complete с ролью' })
  pending!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Имя из профиля банка' })
  name!: string | null;
}

@ApiSchema({ name: 'OAuthProviderDto' })
export class OAuthProviderSchema {
  @ApiProperty({ enum: ['sber', 'tbank'] }) id!: string;
  @ApiProperty() title!: string;
}

@ApiSchema({ name: 'OAuthAuthorizeUrlDto' })
export class OAuthAuthorizeUrlSchema {
  @ApiProperty({ description: 'Адрес страницы входа банка' }) url!: string;
}

@ApiSchema({ name: 'LinkedBankDto' })
export class LinkedBankSchema {
  @ApiProperty({ enum: ['sber', 'tbank'] }) provider!: string;
  @dateTime() linkedAt!: string;
}
