import {
  BID_STATUSES,
  CURRENCIES,
  JOB_CATEGORIES,
  JOB_STATUSES,
  USER_ROLES,
  type AuthSessionDto,
  type BidStatus,
  type ContractorProfileDto,
  type Currency,
  type JobBidDto,
  type JobCategory,
  type JobDetails,
  type JobDto,
  type JobStatus,
  type MyBidDto,
  type OwnJobDto,
  type Paginated,
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
  @dateTime() createdAt!: string;
}

@ApiSchema({ name: 'OwnJobDto' })
export class OwnJobSchema extends JobSchema implements OwnJobDto {
  @dateTime() updatedAt!: string;
  @ApiProperty({ description: 'Редактировать можно только открытый заказ' }) editable!: boolean;
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

@ApiSchema({ name: 'UserDto' })
export class UserSchema implements UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: USER_ROLES, enumName: 'UserRole' }) role!: UserRole;
  @dateTime() createdAt!: string;
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
}

@ApiSchema({ name: 'MyBidJob' })
export class MyBidJobSchema {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() city!: string;
  @ApiProperty({ enum: JOB_STATUSES, enumName: 'JobStatus' }) status!: JobStatus;
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
}
