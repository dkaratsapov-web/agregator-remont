import {
  BID_REJECT_REASONS,
  BID_STATUSES,
  CURRENCIES,
  JOB_CATEGORIES,
  JOB_CLOSE_OUTCOMES,
  JOB_STATUSES,
  NOTIFICATION_KINDS,
  CONTENT_FLAG_KINDS,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGETS,
  PLAN_PARTIES,
  PLAN_STATUSES,
  STAGE_STATUSES,
  UI_MOTIONS,
  UI_SCALES,
  UI_THEMES,
  USER_ROLES,
  type AuthSessionDto,
  type AdminUserDto,
  type ContentFlagDto,
  type ContentFlagKind,
  type ContractorRatingDto,
  type FavoriteIdsDto,
  type FavoriteStateDto,
  type JobReviewStateDto,
  type MyReportDto,
  type PasswordResetLinkDto,
  type PublicContractorDto,
  type ReviewDto,
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
  type JobMessageDto,
  type JobMessagesDto,
  type JobPlanDto,
  type JobStageDto,
  type BlockedStateDto,
  type HiddenStateDto,
  type NotificationData,
  type NotificationDto,
  type NotificationKind,
  type NotificationsPageDto,
  type NotificationsSummaryDto,
  type ReportDto,
  type ReportReason,
  type ReportReceivedDto,
  type ReportStatus,
  type ReportSubjectDto,
  type ReportTarget,
  type JobStatus,
  type LeadDto,
  type MyBidDto,
  type OwnJobDto,
  type Paginated,
  type PlanParty,
  type PlanStatus,
  type PhotoDto,
  type SessionDto,
  type StageStatus,
  type UiMotion,
  type UiPreferences,
  type UiScale,
  type UiTheme,
  type UserDto,
  type UserRole,
} from '@agregator/shared';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'Скрыт модератором: в каталоге не виден, откликаться нельзя' })
  hidden!: boolean;
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

@ApiSchema({ name: 'ContractorRatingDto' })
export class ContractorRatingSchema implements ContractorRatingDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Средняя оценка 1–5 с одним знаком; null — отзывов нет',
  })
  average!: number | null;
  @int() count!: number;
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
  @int({ description: 'Номер публичной карточки мастера' }) publicId!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ type: ContractorProfileSchema, nullable: true })
  profile!: ContractorProfileSchema | null;
  @ApiProperty({ type: ContractorRatingSchema }) rating!: ContractorRatingSchema;
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

const nullableDateTime = (description?: string) =>
  ApiProperty({ type: String, format: 'date-time', nullable: true, description });

@ApiSchema({ name: 'PhotoDto' })
export class PhotoSchema implements PhotoDto {
  @ApiProperty() id!: string;
  @int({ description: 'Ширина полного фото, px' }) width!: number;
  @int({ description: 'Высота полного фото, px' }) height!: number;
  @dateTime() createdAt!: string;
}

@ApiSchema({ name: 'JobStageDto' })
export class JobStageSchema implements JobStageDto {
  @ApiProperty() id!: string;
  @int({ description: 'С 1, порядок сдачи' }) position!: number;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @int({ nullable: true }) durationDays!: number | null;
  @ApiProperty({ enum: STAGE_STATUSES, enumName: 'StageStatus' }) status!: StageStatus;
  @ApiProperty({ type: String, nullable: true, description: 'Комментарий к последней сдаче' })
  submitComment!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Что доработать' })
  reworkComment!: string | null;
  @nullableDateTime() submittedAt!: string | null;
  @nullableDateTime() acceptedAt!: string | null;
  @ApiProperty({ type: [PhotoSchema], description: 'Фото-отчёт к сдачам этапа' })
  photos!: PhotoSchema[];
}

@ApiSchema({ name: 'JobPlanDto' })
export class JobPlanSchema implements JobPlanDto {
  @ApiProperty() jobId!: string;
  @ApiProperty({ enum: PLAN_STATUSES, enumName: 'PlanStatus' }) status!: PlanStatus;
  @int({ description: 'Растёт при каждом изменении; 0 — плана ещё нет' }) version!: number;
  @ApiProperty({ enum: PLAN_PARTIES, enumName: 'PlanParty', description: 'Кто составляет план' })
  author!: PlanParty;
  @ApiProperty({ description: 'true — этапы сдаются строго по порядку' }) sequential!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Почему план вернули' })
  returnReason!: string | null;
  @nullableDateTime() proposedAt!: string | null;
  @nullableDateTime() approvedAt!: string | null;
  @ApiProperty({ type: [JobStageSchema] }) stages!: JobStageSchema[];
  @ApiProperty({ enum: PLAN_PARTIES, enumName: 'PlanParty', description: 'Кто смотрит' })
  viewer!: PlanParty;
}

@ApiSchema({ name: 'JobMessageDto' })
export class JobMessageSchema implements JobMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PLAN_PARTIES, enumName: 'PlanParty', description: 'Чья реплика' })
  author!: PlanParty;
  @ApiProperty({ description: 'Своё ли сообщение для того, кто смотрит' }) own!: boolean;
  @ApiProperty({ description: 'Скрыто модератором: текст пустой, фото нет' }) hidden!: boolean;
  @ApiProperty() body!: string;
  @ApiProperty({ type: [PhotoSchema] }) photos!: PhotoSchema[];
  @dateTime() createdAt!: string;
}

@ApiSchema({ name: 'JobMessagesDto' })
export class JobMessagesSchema implements JobMessagesDto {
  @ApiProperty() jobId!: string;
  @ApiProperty({ enum: PLAN_PARTIES, enumName: 'PlanParty', description: 'Кто смотрит' })
  viewer!: PlanParty;
  @ApiProperty({ description: 'Можно ли писать: заказ в работе' }) canWrite!: boolean;
  @ApiProperty({
    type: [JobMessageSchema],
    description: 'Сообщения страницы, от старых к новым (без курсора — последние)',
  })
  items!: JobMessageSchema[];
  @ApiProperty({ description: 'Есть ли сообщения раньше первого на странице (?before=<id>)' })
  hasEarlier!: boolean;
}

/** Подробности события: только поля, относящиеся к его виду (остальных нет). */
@ApiSchema({ name: 'NotificationData' })
export class NotificationDataSchema implements NotificationData {
  @ApiPropertyOptional({ description: 'Название этапа' }) stageTitle?: string;
  @ApiPropertyOptional({ type: 'integer', description: 'Цена отклика, ₽' }) price?: number;
  @ApiPropertyOptional({ type: 'integer', description: 'Срок из отклика, дней' })
  durationDays?: number;
  @ApiPropertyOptional({ enum: BID_REJECT_REASONS, enumName: 'BidRejectReason' })
  reason?: BidRejectReason;
  @ApiPropertyOptional({ enum: JOB_CLOSE_OUTCOMES, enumName: 'JobCloseOutcome' })
  outcome?: JobCloseOutcome;
}

@ApiSchema({ name: 'NotificationDto' })
export class NotificationSchema implements NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NOTIFICATION_KINDS, enumName: 'NotificationKind' }) kind!: NotificationKind;
  @ApiProperty() jobId!: string;
  @ApiProperty({ description: 'Текущее название заказа' }) jobTitle!: string;
  @ApiProperty({
    enum: PLAN_PARTIES,
    enumName: 'PlanParty',
    description: 'Кем получатель приходится заказу',
  })
  party!: PlanParty;
  @int({ description: 'Сколько событий собрано (новые сообщения); у остальных — 1' })
  count!: number;
  @ApiProperty({ type: NotificationDataSchema }) data!: NotificationDataSchema;
  @ApiProperty() read!: boolean;
  @dateTime() createdAt!: string;
}

@ApiSchema({ name: 'NotificationsPageDto' })
export class NotificationsPageSchema implements NotificationsPageDto {
  @ApiProperty({ type: [NotificationSchema] }) items!: NotificationSchema[];
  @int({ description: 'Непрочитанных всего' }) unread!: number;
  @ApiProperty({ type: String, nullable: true, description: 'Курсор следующей страницы' })
  nextCursor!: string | null;
}

export class NotificationsSummaryJobSchema {
  @ApiProperty() jobId!: string;
  @int() unread!: number;
}

@ApiSchema({ name: 'NotificationsSummaryDto' })
export class NotificationsSummarySchema implements NotificationsSummaryDto {
  @int({ description: 'Непрочитанных всего' }) unread!: number;
  @ApiProperty({ type: [NotificationsSummaryJobSchema], description: 'Заказы с непрочитанным' })
  jobs!: NotificationsSummaryJobSchema[];
  @int({ description: 'Непросмотренные решения по вашим жалобам' }) reportDecisions!: number;
}

@ApiSchema({ name: 'ReportReceivedDto' })
export class ReportReceivedSchema implements ReportReceivedDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'true — такая жалоба от вас уже ждёт разбора' }) duplicate!: boolean;
}

export class ReportPersonSchema {
  @ApiProperty() id!: string;
  @int() publicId!: number;
  @ApiProperty() name!: string;
}

export class ReportAuthorSchema extends ReportPersonSchema {
  @ApiProperty() blocked!: boolean;
}

@ApiSchema({ name: 'ReportSubjectDto' })
export class ReportSubjectSchema implements ReportSubjectDto {
  @ApiProperty() jobId!: string;
  @ApiProperty() jobTitle!: string;
  @ApiProperty({ description: 'Название заказа, текст сообщения или отклика' }) excerpt!: string;
  @ApiProperty({ description: 'Скрыт ли предмет жалобы' }) hidden!: boolean;
  @ApiProperty({ type: ReportAuthorSchema, nullable: true, description: 'Автор предмета жалобы' })
  author!: ReportAuthorSchema | null;
}

@ApiSchema({ name: 'ReportDto' })
export class ReportSchema implements ReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: REPORT_TARGETS, enumName: 'ReportTarget' }) targetType!: ReportTarget;
  @ApiProperty() targetId!: string;
  @ApiProperty({ enum: REPORT_REASONS, enumName: 'ReportReason' }) reason!: ReportReason;
  @ApiProperty() comment!: string;
  @ApiProperty({ enum: REPORT_STATUSES, enumName: 'ReportStatus' }) status!: ReportStatus;
  @ApiProperty({ type: ReportPersonSchema }) reporter!: ReportPersonSchema;
  @ApiProperty({ type: ReportSubjectSchema }) subject!: ReportSubjectSchema;
  @ApiProperty({ type: String, nullable: true, description: 'Решение администратора' })
  note!: string | null;
  @dateTime() createdAt!: string;
  @nullableDateTime() resolvedAt!: string | null;
}

@ApiSchema({ name: 'PaginatedReportDto' })
export class PaginatedReportSchema implements Paginated<ReportDto> {
  @ApiProperty({ type: [ReportSchema] }) items!: ReportSchema[];
  @int() page!: number;
  @int() limit!: number;
  @int() total!: number;
}

@ApiSchema({ name: 'HiddenStateDto' })
export class HiddenStateSchema implements HiddenStateDto {
  @ApiProperty() id!: string;
  @ApiProperty() hidden!: boolean;
}

@ApiSchema({ name: 'BlockedStateDto' })
export class BlockedStateSchema implements BlockedStateDto {
  @ApiProperty() id!: string;
  @ApiProperty() blocked!: boolean;
}

@ApiSchema({ name: 'PasswordResetLinkDto' })
export class PasswordResetLinkSchema implements PasswordResetLinkDto {
  @ApiProperty({ description: 'Токен для ссылки /reset/<токен>; показывается один раз' })
  token!: string;
  @dateTime() expiresAt!: string;
}

@ApiSchema({ name: 'AdminUserDto' })
export class AdminUserSchema implements AdminUserDto {
  @ApiProperty() id!: string;
  @int() publicId!: number;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: USER_ROLES, enumName: 'UserRole' }) role!: UserRole;
  @ApiProperty() blocked!: boolean;
  @dateTime() createdAt!: string;
  @int() jobs!: number;
  @int() bids!: number;
  @int({ description: 'Открытых жалоб на его заказы, сообщения и отклики' }) openReports!: number;
}

@ApiSchema({ name: 'PaginatedAdminUserDto' })
export class PaginatedAdminUserSchema implements Paginated<AdminUserDto> {
  @ApiProperty({ type: [AdminUserSchema] }) items!: AdminUserSchema[];
  @int() page!: number;
  @int() limit!: number;
  @int() total!: number;
}

@ApiSchema({ name: 'ReviewDto' })
export class ReviewSchema implements ReviewDto {
  @ApiProperty() id!: string;
  @int() rating!: number;
  @ApiProperty() text!: string;
  @ApiProperty() authorName!: string;
  @ApiProperty() jobTitle!: string;
  @dateTime() createdAt!: string;
}

@ApiSchema({ name: 'PublicContractorDto' })
export class PublicContractorSchema implements PublicContractorDto {
  @int() publicId!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ type: ContractorProfileSchema, nullable: true })
  profile!: ContractorProfileSchema | null;
  @ApiProperty({ type: ContractorRatingSchema }) rating!: ContractorRatingSchema;
  @int() completedJobs!: number;
  @dateTime() memberSince!: string;
  @ApiProperty({ type: [ReviewSchema] }) reviews!: ReviewSchema[];
  @ApiProperty() hasMoreReviews!: boolean;
}

export class ReviewContractorSchema {
  @int() publicId!: number;
  @ApiProperty() name!: string;
}

@ApiSchema({ name: 'JobReviewStateDto' })
export class JobReviewStateSchema implements JobReviewStateDto {
  @ApiProperty() canReview!: boolean;
  @ApiProperty({ type: ReviewSchema, nullable: true }) review!: ReviewSchema | null;
  @ApiProperty({ type: ReviewContractorSchema, nullable: true })
  contractor!: ReviewContractorSchema | null;
}

@ApiSchema({ name: 'FavoriteStateDto' })
export class FavoriteStateSchema implements FavoriteStateDto {
  @ApiProperty() jobId!: string;
  @ApiProperty() favorite!: boolean;
}

@ApiSchema({ name: 'MyReportDto' })
export class MyReportSchema implements MyReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: REPORT_TARGETS, enumName: 'ReportTarget' }) targetType!: ReportTarget;
  @ApiProperty({ enum: REPORT_REASONS, enumName: 'ReportReason' }) reason!: ReportReason;
  @ApiProperty({ enum: REPORT_STATUSES, enumName: 'ReportStatus' }) status!: ReportStatus;
  @ApiProperty() jobId!: string;
  @ApiProperty() jobTitle!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @dateTime() createdAt!: string;
  @nullableDateTime() resolvedAt!: string | null;
  @ApiProperty({ description: 'Решение есть, но ещё не просмотрено' }) unseen!: boolean;
}

@ApiSchema({ name: 'PaginatedMyReportDto' })
export class PaginatedMyReportSchema implements Paginated<MyReportDto> {
  @ApiProperty({ type: [MyReportSchema] }) items!: MyReportSchema[];
  @int() page!: number;
  @int() limit!: number;
  @int() total!: number;
}

@ApiSchema({ name: 'ContentFlagDto' })
export class ContentFlagSchema implements ContentFlagDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['MESSAGE', 'BID'], enumName: 'ContentFlagTarget' })
  targetType!: 'MESSAGE' | 'BID';
  @ApiProperty() targetId!: string;
  @ApiProperty({ enum: CONTENT_FLAG_KINDS, enumName: 'ContentFlagKind', isArray: true })
  kinds!: ContentFlagKind[];
  @ApiProperty({ enum: REPORT_STATUSES, enumName: 'ReportStatus' }) status!: ReportStatus;
  @ApiProperty() jobId!: string;
  @ApiProperty() jobTitle!: string;
  @ApiProperty() excerpt!: string;
  @ApiProperty() hidden!: boolean;
  @ApiProperty({ type: ReportAuthorSchema }) author!: ReportAuthorSchema;
  @dateTime() createdAt!: string;
}

@ApiSchema({ name: 'PaginatedContentFlagDto' })
export class PaginatedContentFlagSchema implements Paginated<ContentFlagDto> {
  @ApiProperty({ type: [ContentFlagSchema] }) items!: ContentFlagSchema[];
  @int() page!: number;
  @int() limit!: number;
  @int() total!: number;
}

@ApiSchema({ name: 'FavoriteIdsDto' })
export class FavoriteIdsSchema implements FavoriteIdsDto {
  @ApiProperty({ type: [String] }) jobIds!: string[];
}
