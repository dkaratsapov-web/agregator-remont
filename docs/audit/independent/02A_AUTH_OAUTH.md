# Аудит 02-А — аутентификация и банковский вход

**Целевой SHA**: `89614b5702b13435f05d9e1dbc7f126abdaa6801` (main).  
**Метод:** независимое статическое чтение GitHub по SHA. Не проводился реальный penetration test / Jest / PostgreSQL.

## Прочитанные файлы этой партии
`apps/api/src/auth/auth.controller.ts`, `auth.service.ts`, `auth.module.ts`, `auth.types.ts`, `current-auth.decorator.ts`, `session.guard.ts`, `session-token.ts`, `roles.ts`, `rate-limit.ts`, `password.ts`, `password-reset.ts`, `login-throttle.ts`, `dto/register.dto.ts`, `dto/login.dto.ts`, `dto/password-reset.dto.ts`; `apps/api/src/oauth/oauth.controller.ts`, `oauth.service.ts`, `oauth.config.ts`, `oauth.providers.ts`, `oauth.http.ts`, `dto/oauth.dto.ts`; `apps/api/src/auth/auth.service.spec.ts`, `apps/api/src/oauth/oauth.config.spec.ts`. Прочие вспомогательные файлы тестов/OAuth ещё подлежат проверке.

## Проверенные правила и их доказательства
- `session-token.ts`: CSPRNG 32 bytes, base64url 43 symbols, SHA-256 token hash at rest, 30-day expiry.
- `SessionGuard`: bearer token resolve через БД; role не доверяется пользователю.
- `RolesGuard`: explicit roles; deny on absent auth; admin не выдаётся через `RegisterDto` или OAuth DTO.
- `AuthService.register`: user + first session in one transaction; handles duplicate unique P2002 as 409.
- `AuthService.login`: dummy argon2 check for unknown email, row-lock before new session and passwordHash revalidation.
- `AuthService.resetPassword`: token hash, expiry/usedAt, row-lock, delete all active sessions, audit, create new session atomically.
- `LoginThrottle.attempt`: atomic PostgreSQL upsert; serializes same email even across API instances, unlike IP throttler.
- `OAuthService`: disabled if config absent; role only customer/contractor, pending completion token signed HMAC with TTL; existing email not auto-linked.
- `OAuth HTTP`: server-side timeout 10s, max response body 256 KiB, certificate validation default TLS; optional mTLS.
- `OAuth Sber`: PKCE, nonce/audience claims inspected; userinfo subject correlation; secure origin configuration prevents http in production.
- `pnpm-lock.yaml` прочитан на целевом SHA: lockfile v9, resolved `multer@2.5.0`, `body-parser@2.4.0`, `next@16.4.1`, Prisma 6.19.3; selective transitive overrides align with package-manager configuration. **Это не независимый vulnerability scan**.

## Предварительные находки / проверки

### AUD-09 — OAuth id_token JWT claims без проверки подписи (P1 перед включением банковского входа; FEATURE DISABLED для текущей беты)
`apps/api/src/oauth/oauth.providers.ts`, helper `jwtPayload()`: считывает payload JWT через base64url и JSON, не проверяя JWS signature/issuer/expiry. Используются `aud`, `nonce`, `sub`; однако **access_token и id_token извлекаются из ответа на server-to-server token exchange по TLS**, userinfo отдельно получается с access_token, и `sub` сверяется, что ограничивает возможность атакующего подменить claims. Не утверждается практическая компрометация. До активации провайдера выполнить protocol conformance review: проверки issuer, expiry, signature/JWKS по требованиям Sber OIDC и boundary между token endpoint и userinfo; добавить negative tests фальшивого/expired id_token.

### AUD-10 — возможная гонка банковского входа против блокировки/удаления аккаунта (P1 test required)
`oauth.service.ts:217-231` использует `findLinked` вне транзакционной блокировки и затем `auth.createSession(this.prisma, account.user)`. `auth.service.ts:~85-95` в обычном password login берёт `users FOR UPDATE` перед созданием сессии. Возможное interleaving: OAuth прочитал not blocked, админ поставил blocked+удалил sessions, OAuth позже создаёт session. `resolveSession` всё равно отвергает blocked user, поэтому **действующий доступ не доказан**. Риск — лишняя запись сессии и stale account info; проверить конкуренцию unblock/delete и банк linked в E2E. Единообразно брать user row-lock перед OAuth session create.

### AUD-11 — rate limiting архитектура (из этапа 01)
IP throttler per process; brute force by account защищён таблицей login_failures. При >1 API инстансе глобальные лимиты не общие, хотя email throttle остаётся общим.

## Осталось в этапе 02
Просмотреть полностью `device.ts`, `auth.types.ts`, `current-auth.decorator.ts`, `oauth.module.ts`, полный `oauth.providers.ts` включая TBank, связанные browser state/cookie/PKCE и E2E (`auth.e2e-spec.ts`, `oauth.e2e-spec.ts`, `login-throttle.e2e-spec.ts`, role/access-matrix). После этого выполнить матрицу routes × anonymous/customer/contractor/admin/blocked/deleted.

**Статус этапа 02: IN PROGRESS.**