/**
 * Проверка на этапе компиляции (ADR 0003, этап PR B): рукописные интерфейсы ответов совпадают
 * с типами, сгенерированными из apps/api/openapi.json. Расхождение ломает `pnpm typecheck`.
 * После PR C интерфейсы станут псевдонимами сгенерированных типов и файл можно удалить.
 */
import type { AuthSessionDto, UserDto } from './auth';
import type { ContractorProfileDto, JobBidDto, MyBidDto } from './bids';
import type { components } from './generated/openapi';
import type { JobDto, OwnJobDto } from './jobs';
import type { Paginated } from './pagination';

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
];
