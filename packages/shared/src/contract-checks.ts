/**
 * Проверка на этапе компиляции (ADR 0003, этап PR B): рукописные интерфейсы ответов совпадают
 * с типами, сгенерированными из apps/api/openapi.json. Расхождение ломает `pnpm typecheck`.
 * После PR C интерфейсы станут псевдонимами сгенерированных типов и файл можно удалить.
 */
import type { AuthSessionDto, SessionDto, UserDto } from './auth';
import type { ContractorProfileDto, JobBidDto, MyBidDto } from './bids';
import type { components } from './generated/openapi';
import type { JobDraftDto, JobDto, JobItemDto, OwnJobDto } from './jobs';
import type { LeadDto } from './leads';
import type { JobMessageDto, JobMessagesDto, PhotoDto } from './messages';
import type {
  NotificationData,
  NotificationDto,
  NotificationsPageDto,
  NotificationsSummaryDto,
} from './notifications';
import type {
  BlockedStateDto,
  HiddenStateDto,
  ReportDto,
  ReportReceivedDto,
  ReportSubjectDto,
} from './moderation';
import type { Paginated } from './pagination';
import type { JobPlanDto, JobStageDto } from './plans';

type Schemas = components['schemas'];

/** Строгое равенство типов (не только взаимная присваиваемость). */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type ContractChecks = [
  Expect<Equal<JobDto, Schemas['JobDto']>>,
  Expect<Equal<OwnJobDto, Schemas['OwnJobDto']>>,
  Expect<Equal<Paginated<JobDto>, Schemas['PaginatedJobDto']>>,
  Expect<Equal<Paginated<OwnJobDto>, Schemas['PaginatedOwnJobDto']>>,
  Expect<Equal<UserDto, Schemas['UserDto']>>,
  Expect<Equal<AuthSessionDto, Schemas['AuthSessionDto']>>,
  Expect<Equal<ContractorProfileDto, Schemas['ContractorProfileDto']>>,
  Expect<Equal<MyBidDto, Schemas['MyBidDto']>>,
  Expect<Equal<Paginated<MyBidDto>, Schemas['PaginatedMyBidDto']>>,
  Expect<Equal<JobBidDto, Schemas['JobBidDto']>>,
  Expect<Equal<JobPlanDto, Schemas['JobPlanDto']>>,
  Expect<Equal<JobStageDto, Schemas['JobStageDto']>>,
  Expect<Equal<PhotoDto, Schemas['PhotoDto']>>,
  Expect<Equal<JobMessageDto, Schemas['JobMessageDto']>>,
  Expect<Equal<JobMessagesDto, Schemas['JobMessagesDto']>>,
  Expect<Equal<NotificationData, Schemas['NotificationData']>>,
  Expect<Equal<NotificationDto, Schemas['NotificationDto']>>,
  Expect<Equal<NotificationsPageDto, Schemas['NotificationsPageDto']>>,
  Expect<Equal<NotificationsSummaryDto, Schemas['NotificationsSummaryDto']>>,
  Expect<Equal<ReportReceivedDto, Schemas['ReportReceivedDto']>>,
  Expect<Equal<ReportSubjectDto, Schemas['ReportSubjectDto']>>,
  Expect<Equal<ReportDto, Schemas['ReportDto']>>,
  Expect<Equal<Paginated<ReportDto>, Schemas['PaginatedReportDto']>>,
  Expect<Equal<HiddenStateDto, Schemas['HiddenStateDto']>>,
  Expect<Equal<BlockedStateDto, Schemas['BlockedStateDto']>>,
  // AUDIT_FINDINGS ARCH-6: сеансы, черновики, позиции заказа и заявки тоже сверяются.
  Expect<Equal<SessionDto, Schemas['SessionDto']>>,
  Expect<Equal<JobDraftDto, Schemas['JobDraftDto']>>,
  Expect<Equal<JobItemDto, Schemas['JobItemDto']>>,
  Expect<Equal<LeadDto, Schemas['LeadDto']>>,
  Expect<Equal<Paginated<LeadDto>, Schemas['PaginatedLeadDto']>>,
];
