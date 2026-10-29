# Опись функций монорепозитория agregator-remont

- Основа описи: коммит `4fca28f` (main после PR #57), 23.10.2026. Номера строк — по этому коммиту;
  в следующих PR серии (аудит 23.10.2026) строки в изменённых файлах сдвинулись.
- После `4fca28f` в серии добавлены: `GET /v1/me/export` и `POST /v1/me/delete` (свои данные),
  Route Handler `GET /account/export`, Server Action `deleteAccountAction`; итоговые числа ниже —
  на `4fca28f`, с этими добавками маршрутов API 88, Route Handlers 13.
- Затем поддержка (`docs/FEEDBACK.md`): `POST` и `GET /v1/me/feedback`, `GET /v1/admin/feedback`,
  `POST /v1/admin/feedback/{id}/reply`, `POST /v1/me/feedback/seen` (маршрутов API 93), Server
  Actions `sendFeedbackAction`, `markFeedbackSeenAction`,
  `replyFeedbackAction` и обёртка `replyFeedbackFormAction`, страницы `/account/feedback` и
  `/admin/feedback`, модель `Feedback`.
- Что описано: маршруты API (NestJS), Server Actions и Route Handlers web (Next.js 16), страницы,
  модели Prisma, фоновые задачи, скрипты автообновления, задачи CI и найденные пробелы.

Итого: **86** маршрутов API, **64** экспортированных Server Actions, **12** Route Handlers в 10 файлах `route.ts`, **27** страниц `page.tsx`, **24** модели Prisma, **2** триггера в базе.

## Как читать таблицы

- Пути API в таблицах даны от `apps/api/src/`, пути web от `apps/web/src/app/`. Строка указывает на декоратор `@Get/@Post/…` контроллера или на объявление функции.
- **Тесты API.** Каждую операцию из `apps/api/openapi.json` проходит `contract.e2e-spec.ts`. Последний тест этого файла (`apps/api/test/contract.e2e-spec.ts:1567`, `uncoveredResponses`) падает, если какая-то пара «операция + статус» не проверена. В колонке «Тесты» поэтому всегда есть `contract`, а за ним идут остальные файлы `apps/api/test/*.e2e-spec.ts`, где путь вызывается тем же HTTP-методом. Суффикс `.e2e-spec.ts` опущен. Поиск учитывал `${...}`, константы путей (`const base = …`) и массивы вида `['get', '/v1/me']`. `helpers.ts` (регистрация через `signUp`) используется почти во всех файлах и отдельно не указан.
- **Браузерный сценарий в разделе 1.** Это `scripts/*.mjs`, которые вызывают маршрут API напрямую через `fetch`/`api(...)` с тем же методом (без `method:` считается GET). Те же маршруты сценарии вызывают и через интерфейс; это видно в колонке «Тесты» раздела 2 (Server Actions).
- **Лимиты.** Ко всем маршрутам, кроме `/health*` (`@SkipThrottle`), применяется общий лимит `default`: `RATE_LIMIT_PER_MIN`, по умолчанию 120 запросов в минуту (`config/env.ts:114`). `Auth` — это `@AuthRateLimited` (`AUTH_RATE_LIMIT_PER_MIN`, по умолчанию 10 в минуту). `Write` — это `@WriteRateLimited` (`WRITE_RATE_LIMIT_PER_MIN`, по умолчанию 30 в минуту). Счётчики хранятся в памяти процесса (`app.module.ts:35`).
- **Доступ.** «Сессия» означает `SessionGuard` (`auth/session.guard.ts:10`): `Bearer`-токен действующей сессии, пользователь не заблокирован (`auth/auth.service.ts:143`). Роль проверяет `RolesGuard` + `@Roles` (`auth/roles.ts:37`), при чужой роли ответ 403 `FORBIDDEN_ROLE`.

---

## 1. Маршруты API

| Метод и путь | Контроллер file:line | Сервис (главный метод) file:line | Доступ | Проверка владения/участия | Лимиты | Тесты | Браузерный сценарий |
|---|---|---|---|---|---|---|---|
| GET /health | health/health.controller.ts:17 `check` | — (без БД) | публичный | — | нет (`@SkipThrottle`) | contract, app | smoke.mjs |
| GET /health/ready | health/health.controller.ts:28 `ready` | `PrismaService.$queryRaw SELECT 1` (health.controller.ts:36), таймаут 2 с | публичный | — | нет (`@SkipThrottle`) | contract (только он) | — |
| GET /v1/admin/analytics | analytics/analytics.controller.ts:30 `report` | analytics/analytics.service.ts:49 `report` | ADMIN | — (только роль) | default | contract, analytics | — |
| POST /v1/admin/bids/{id}/hidden | moderation/moderation.controller.ts:195 `hideBid` | moderation/moderation.service.ts:166 `setBidHidden` | ADMIN | — (только роль) | Write | contract, moderation | — |
| GET /v1/admin/flags | moderation/moderation.controller.ts:129 `listFlags` | moderation/moderation.service.ts:114 `listFlags` | ADMIN | — | default | contract, accounts | — |
| POST /v1/admin/flags/{id}/resolve | moderation/moderation.controller.ts:136 `resolveFlag` | moderation/moderation.service.ts:134 `resolveFlag` | ADMIN | — | Write | contract (только он) | — |
| POST /v1/admin/jobs/{id}/hidden | moderation/moderation.controller.ts:169 `hideJob` | moderation/moderation.service.ts:158 `setJobHidden` | ADMIN | — | Write | contract, moderation | — |
| GET /v1/admin/leads | leads/leads.controller.ts:54 `list` | leads/leads.service.ts:80 `list` | ADMIN | — | default | contract, access-matrix, leads | — |
| PATCH /v1/admin/leads/{id} | leads/leads.controller.ts:61 `update` | leads/leads.service.ts:100 `setProcessed` | ADMIN | — | Write | contract, access-matrix, leads | — |
| POST /v1/admin/messages/{id}/hidden | moderation/moderation.controller.ts:182 `hideMessage` | moderation/moderation.service.ts:162 `setMessageHidden` | ADMIN | — | Write | contract, moderation | — |
| GET /v1/admin/reports | moderation/moderation.controller.ts:149 `list` | moderation/moderation.service.ts:64 `list` | ADMIN | — | default | contract, moderation | moderation-e2e.mjs |
| POST /v1/admin/reports/{id}/resolve | moderation/moderation.controller.ts:156 `resolve` | moderation/moderation.service.ts:84 `resolve` | ADMIN | — | Write | contract, accounts, moderation | accounts-e2e.mjs |
| POST /v1/admin/reviews/{id}/hidden | moderation/moderation.controller.ts:208 `hideReview` | moderation/moderation.service.ts:170 `setReviewHidden` | ADMIN | — | Write | contract, accounts | — |
| GET /v1/admin/users | moderation/moderation.controller.ts:111 `listUsers` | moderation/admin-users.service.ts:24 `list` | ADMIN | — | default | contract, accounts | — |
| POST /v1/admin/users/{id}/blocked | moderation/moderation.controller.ts:221 `block` | moderation/moderation.service.ts:174 `setUserBlocked` | ADMIN | — | Write | contract, moderation | — |
| POST /v1/admin/users/{id}/password-reset | moderation/moderation.controller.ts:118 `issuePasswordReset` | moderation/admin-users.service.ts:91 `issuePasswordReset` | ADMIN | — | Write | contract, accounts | — |
| POST /v1/auth/login | auth/auth.controller.ts:38 `login` | auth/auth.service.ts:65 `login` | публичный | — | Auth + пауза после серии неверных паролей (`LoginThrottle`, auth.service.ts:70) | contract, access-matrix, account, accounts, auth-rate-limit, auth, client-ip-rate-limit, errors, leads, login-throttle, moderation | accounts-e2e.mjs, ux-e2e.mjs |
| POST /v1/auth/logout | auth/auth.controller.ts:62 `logout` | auth/auth.service.ts:138 `logout` | любая сессия | отзывается только своя сессия `auth.sessionId` | default | contract, access-matrix, auth | smoke.mjs |
| POST /v1/auth/oauth/complete | oauth/oauth.controller.ts:81 `complete` | oauth/oauth.service.ts:128 `complete` | публичный (подписанный `pending`) | подпись `pending` (oauth.service.ts:291 `verifyPending`) | Auth | contract, oauth | — |
| GET /v1/auth/oauth/providers | oauth/oauth.controller.ts:48 `providers` | oauth/oauth.service.ts:81 `providers` | публичный | — | default | contract, oauth | — |
| POST /v1/auth/oauth/{provider}/authorize | oauth/oauth.controller.ts:54 `authorize` | oauth/oauth.service.ts:85 `authorizeUrl` | публичный | — | Auth | contract, oauth | — |
| POST /v1/auth/oauth/{provider}/callback | oauth/oauth.controller.ts:63 `callback` | oauth/oauth.service.ts:105 `signIn` | публичный | код банка + PKCE/nonce | Auth | contract, oauth | — |
| POST /v1/auth/password-reset | auth/auth.controller.ts:50 `resetPassword` | auth/auth.service.ts:99 `resetPassword` | публичный (токен ссылки) | токен сброса | Auth | contract, accounts | — |
| POST /v1/auth/register | auth/auth.controller.ts:27 `register` | auth/auth.service.ts:43 `register` | публичный | — | Auth | contract, access-matrix, account, auth, errors, leads (+ helpers.ts) | auth-integration.mjs, lib/forms.mjs, schema-compat-flow.mjs, smoke.mjs |
| GET /v1/contractors/{publicId} | reviews/reviews.controller.ts:54 `get` | reviews/reviews.service.ts:94 `contractor` | публичный | — (без контактов) | default | contract, accounts | schema-compat-flow.mjs |
| GET /v1/jobs | jobs/jobs.controller.ts:15 `list` | jobs/jobs.service.ts:28 `list` | публичный | — | default | contract, access-matrix, analytics, app, auth-rate-limit, catalog-filters, drafts, job-details, job-items, moderation | smoke.mjs |
| GET /v1/jobs/{id} | jobs/jobs.controller.ts:22 `getById` | jobs/jobs.service.ts:116 `getById` | публичный | скрытый заказ даёт 404 (jobs.service.ts:121) | default | contract, access-matrix, analytics, app, bids, errors, job-details, job-items, moderation, my-jobs | bids-integration, chat-e2e, job-items-e2e, jobs-integration, schema-compat-flow, smoke |
| POST /v1/jobs/{jobId}/bids | bids/bids.controller.ts:41 `create` | bids/bids.service.ts:46 `create` | CONTRACTOR | заказ OPEN и не скрыт (`FOR SHARE`, bids.service.ts:70-76) | Write + квота 30 откликов в сутки (bids.service.ts:56) | contract, access-matrix, accounts, analytics, bids-concurrency, bids, contacts, errors, messages, moderation, my-jobs-concurrency, notifications, plans | accounts-e2e, bids-integration, chat-e2e, moderation-e2e, mvp-e2e, notifications-e2e, plan-e2e, price-estimate-e2e, schema-compat-flow |
| DELETE /v1/jobs/{jobId}/contacts | contacts/contacts.controller.ts:58 `hide` | contacts/contacts.service.ts:26 `setShared(false)` | любая сессия | `findDeal` (plans/deal.ts:25): владелец или выбранный исполнитель, остальным 404 | Write | contract, contacts | — |
| GET /v1/jobs/{jobId}/contacts | contacts/contacts.controller.ts:33 `state` | contacts/contacts.service.ts:19 `state` | любая сессия | `findDeal` | default | contract, contacts | — |
| PUT /v1/jobs/{jobId}/contacts | contacts/contacts.controller.ts:43 `share` | contacts/contacts.service.ts:26 `setShared(true)` | любая сессия | `findDeal` (с `FOR UPDATE`) | Write | contract, analytics, contacts | — |
| GET /v1/jobs/{jobId}/messages | messages/messages.controller.ts:36 `list` | messages/messages.service.ts:45 `list` | любая сессия | `findDeal` + только переписка текущей сделки (`contractorId`) | default | contract, messages, moderation | chat-e2e, schema-compat-flow |
| POST /v1/jobs/{jobId}/messages | messages/messages.controller.ts:47 `send` | messages/messages.service.ts:59 `send` | любая сессия | `findDeal` (с блокировкой), заказ IN_PROGRESS | Write; фото не больше 5 за раз и 200 на сделку (photos.service.ts:56, 77) | contract, accounts, analytics, messages, moderation, notifications | moderation-e2e, notifications-e2e, schema-compat-flow |
| GET /v1/jobs/{jobId}/photos/{photoId} | photos/photos.controller.ts:27 `get` | photos/photos.service.ts:109 `read` | любая сессия | владелец или текущий выбранный исполнитель, либо ADMIN; фото скрытого сообщения сторонам не отдаётся (photos.service.ts:126-137) | default | contract, messages, moderation | — |
| GET /v1/jobs/{jobId}/plan | plans/plans.controller.ts:57 `get` | plans/plans.service.ts:46 `get` | любая сессия | `findDeal` | default | contract, messages, plans | chat-e2e, plan-e2e, schema-compat-flow |
| PUT /v1/jobs/{jobId}/plan | plans/plans.controller.ts:64 `save` | plans/plans.service.ts:52 `save` | любая сессия | `findDeal` + `requireAuthor` (plans.service.ts:429) | Write | contract, errors, messages, notifications, plans | chat-e2e, schema-compat-flow |
| POST /v1/jobs/{jobId}/plan/approve | plans/plans.controller.ts:102 `approve` | plans/plans.service.ts:148 `approve` | любая сессия | `findDeal` + `requireCounterparty` (plans.service.ts:436) | Write | contract, messages, notifications, plans | chat-e2e, schema-compat-flow |
| POST /v1/jobs/{jobId}/plan/author | plans/plans.controller.ts:76 `setAuthor` | plans/plans.service.ts:93 `setAuthor` | любая сессия | `findDeal`, только сторона OWNER (plans.service.ts:95) | Write | contract, notifications, plans | — |
| POST /v1/jobs/{jobId}/plan/propose | plans/plans.controller.ts:89 `propose` | plans/plans.service.ts:122 `propose` | любая сессия | `findDeal` + `requireAuthor` | Write | contract, messages, notifications, plans | chat-e2e, schema-compat-flow |
| POST /v1/jobs/{jobId}/plan/return | plans/plans.controller.ts:115 `returnPlan` | plans/plans.service.ts:171 `returnPlan` | любая сессия | `findDeal` + `requireCounterparty` | Write | contract, notifications, plans | — |
| POST /v1/jobs/{jobId}/quit | plans/plans.controller.ts:189 `quit` | plans/plans.service.ts:328 `quit` | любая сессия | `findDeal`, только сторона CONTRACTOR (plans.service.ts:331) | Write | contract, contacts, messages, notifications, plans | schema-compat-flow |
| POST /v1/jobs/{jobId}/stages/{stageId}/accept | plans/plans.controller.ts:161 `accept` | plans/plans.service.ts:258 `acceptStage` | любая сессия | `findDeal`, только OWNER (plans.service.ts:260) | Write | contract, notifications, plans | — |
| POST /v1/jobs/{jobId}/stages/{stageId}/rework | plans/plans.controller.ts:174 `rework` | plans/plans.service.ts:287 `reworkStage` | любая сессия | `findDeal`, только OWNER (plans.service.ts:294) | Write | contract, notifications, plans | — |
| POST /v1/jobs/{jobId}/stages/{stageId}/submit | plans/plans.controller.ts:129 `submit` | plans/plans.service.ts:204 `submitStage` (+ photos.service.ts:54 `prepare`) | любая сессия | `findDeal`, только CONTRACTOR (plans.service.ts:212) | Write; фото: 5 за раз, 200 на сделку | contract, messages, notifications, plans | schema-compat-flow |
| POST /v1/leads | leads/leads.controller.ts:33 `create` | leads/leads.service.ts:40 `create` | публичный | — | Write + общий потолок 300 заявок в сутки (leads.service.ts:62) + повтор телефона за сутки игнорируется; при выключенном приёме 503 | contract, leads | — |
| GET /v1/me | users/me.controller.ts:49 `me` | users/user.mapper.ts:5 `toUserDto` | любая сессия | только свои данные (из сессии) | default | contract, access-matrix, account, accounts, auth, errors, job-details, job-items, moderation, oauth | accounts-e2e, auth-integration, cabinet-e2e, journey-e2e, schema-compat-flow, smoke, ux-e2e |
| PATCH /v1/me | users/me.controller.ts:55 `updateProfile` | users/account.service.ts:30 `updateProfile` | любая сессия | своя запись | Write | contract, access-matrix, account | accounts-e2e |
| DELETE /v1/me/avatar | users/me.controller.ts:145 `deleteAvatar` | users/account.service.ts:175 `deleteAvatar` | любая сессия | своя запись | Write | contract, access-matrix, account | — |
| GET /v1/me/avatar | users/me.controller.ts:107 `avatar` | users/account.service.ts:183 `getAvatar` | любая сессия | своя запись | default | contract, access-matrix, account | — |
| PUT /v1/me/avatar | users/me.controller.ts:120 `setAvatar` | users/account.service.ts:161 `setAvatar` | любая сессия | своя запись | Write; файл до 5 МБ (me.controller.ts:124) | contract, access-matrix, account | landing-e2e.mjs |
| GET /v1/me/bids | bids/bids.controller.ts:64 `list` | bids/bids.service.ts:126 `listMine` | CONTRACTOR | `contractorId` в where | default | contract, access-matrix, bids, my-jobs-concurrency | bids-integration.mjs |
| POST /v1/me/bids/{bidId}/withdraw | bids/bids.controller.ts:74 `withdraw` | bids/bids.service.ts:144 `withdraw` | CONTRACTOR | `contractor_id` в SQL (bids.service.ts:148, 152) | Write | contract, access-matrix, bids-concurrency, bids, errors, my-jobs-concurrency, notifications | — |
| GET /v1/me/drafts | my-jobs/drafts.controller.ts:35 `list` | my-jobs/drafts.service.ts:24 `list` | CUSTOMER | `ownerId` в where (drafts.service.ts:26) | default | contract, access-matrix, drafts | drafts-e2e, journey-e2e, mvp-e2e |
| POST /v1/me/drafts | my-jobs/drafts.controller.ts:48 `create` | my-jobs/drafts.service.ts:37 `create` | CUSTOMER | `ownerId` из сессии | Write + не больше 10 черновиков (drafts.service.ts:42) | contract, access-matrix, analytics, drafts, job-items, publish-concurrency | price-estimate-e2e |
| DELETE /v1/me/drafts/{id} | my-jobs/drafts.controller.ts:68 `remove` | my-jobs/drafts.service.ts:78 `remove` | CUSTOMER | `ownerId` в where (drafts.service.ts:80) | Write | contract, access-matrix, drafts | — |
| GET /v1/me/drafts/{id} | my-jobs/drafts.controller.ts:41 `get` | my-jobs/drafts.service.ts:33 `get` | CUSTOMER | `findOwned` (drafts.service.ts:85) | default | contract, access-matrix, drafts | cabinet-e2e, journey-e2e |
| PUT /v1/me/drafts/{id} | my-jobs/drafts.controller.ts:56 `replace` | my-jobs/drafts.service.ts:54 `replace` | CUSTOMER | `ownerId` в where (drafts.service.ts:55) | Write | contract, access-matrix, drafts, publish-concurrency | — |
| GET /v1/me/favorites | favorites/favorites.controller.ts:21 `list` | favorites/favorites.service.ts:23 `list` | любая сессия | `userId` в where, скрытые заказы исключены (favorites.service.ts:25) | default | contract, accounts | — |
| GET /v1/me/favorites/ids | favorites/favorites.controller.ts:31 `ids` | favorites/favorites.service.ts:39 `ids` | любая сессия | `userId` в where | default | contract, accounts | — |
| DELETE /v1/me/favorites/{jobId} | favorites/favorites.controller.ts:45 `remove` | favorites/favorites.service.ts:70 `remove` | любая сессия | `userId` в where (favorites.service.ts:72) | Write | contract, accounts | — |
| PUT /v1/me/favorites/{jobId} | favorites/favorites.controller.ts:37 `add` | favorites/favorites.service.ts:48 `add` | любая сессия | заказ не скрыт; `userId` из сессии | Write + не больше 200 в избранном (favorites.service.ts:60) | contract, accounts | schema-compat-flow |
| GET /v1/me/jobs | my-jobs/my-jobs.controller.ts:36 `list` | my-jobs/my-jobs.service.ts:84 `list` | CUSTOMER | `ownerId` в where (my-jobs.service.ts:85) | default | contract, access-matrix, my-jobs, write-rate-limit | drafts-e2e, jobs-integration, mvp-e2e, schema-compat-flow |
| POST /v1/me/jobs | my-jobs/my-jobs.controller.ts:53 `create` | my-jobs/my-jobs.service.ts:102 `create` | CUSTOMER | `ownerId` из сессии; черновик удаляется только свой (my-jobs.service.ts:151) | Write + 20 заказов в сутки (my-jobs.service.ts:133) | contract, access-matrix, accounts, analytics, bids-concurrency, bids, contacts, drafts, errors, job-details, job-items, messages, moderation, my-jobs-concurrency, my-jobs, notifications, plans, publish-concurrency, write-rate-limit | accounts-e2e, bids-integration, cabinet-e2e, chat-e2e, jobs-integration, moderation-e2e, mvp-e2e, notifications-e2e, plan-e2e, price-estimate-e2e, schema-compat-flow |
| GET /v1/me/jobs/{id} | my-jobs/my-jobs.controller.ts:46 `get` | my-jobs/my-jobs.service.ts:98 `get` | CUSTOMER | `findOwned` (my-jobs.service.ts:330) | default | contract, access-matrix, moderation, my-jobs | cabinet-e2e, jobs-integration, journey-e2e, mvp-e2e, plan-e2e |
| PATCH /v1/me/jobs/{id} | my-jobs/my-jobs.controller.ts:61 `update` | my-jobs/my-jobs.service.ts:187 `update` | CUSTOMER | `lockOwned` (`owner_id` в SQL + `FOR UPDATE`, my-jobs.service.ts:322) | Write | contract, access-matrix, errors, job-details, job-items, my-jobs-concurrency, my-jobs | jobs-integration, schema-compat-flow |
| POST /v1/me/jobs/{id}/close | my-jobs/my-jobs.controller.ts:73 `close` | my-jobs/my-jobs.service.ts:274 `close` | CUSTOMER | `lockOwned` | Write | contract, access-matrix, accounts, analytics, bids, errors, messages, my-jobs-concurrency, my-jobs, notifications, plans | accounts-e2e, chat-e2e, schema-compat-flow |
| GET /v1/me/jobs/{jobId}/bids | bids/bids.controller.ts:94 `list` | bids/bids.service.ts:184 `listForOwner` | CUSTOMER | `findOwnedJob` (bids.service.ts:337) | default | contract, access-matrix, accounts, bids, moderation, my-jobs-concurrency | bids-integration, cabinet-e2e, journey-e2e, plan-e2e |
| POST /v1/me/jobs/{jobId}/bids/{bidId}/accept | bids/bids.controller.ts:105 `accept` | bids/bids.service.ts:220 `accept` | CUSTOMER | `lockOwnedJob` (bids.service.ts:325) | Write | contract, access-matrix, accounts, analytics, bids-concurrency, bids, contacts, messages, moderation, notifications, plans | accounts-e2e, chat-e2e, moderation-e2e, mvp-e2e, notifications-e2e, plan-e2e, schema-compat-flow |
| GET /v1/me/jobs/{jobId}/review | reviews/reviews.controller.ts:24 `state` | reviews/reviews.service.ts:46 `state` | CUSTOMER | `ownedJob` (`ownerId` в where, reviews.service.ts:142) | default | contract, accounts | schema-compat-flow |
| POST /v1/me/jobs/{jobId}/review | reviews/reviews.controller.ts:34 `create` | reviews/reviews.service.ts:59 `create` | CUSTOMER | `ownedJob` + `doneWith` (reviews.service.ts:153) | Write | contract, accounts, analytics | schema-compat-flow |
| GET /v1/me/notifications | notifications/notifications.controller.ts:30 `list` | notifications/notifications.service.ts:47 `list` | любая сессия | `userId` в where | default | contract, notifications | schema-compat-flow |
| POST /v1/me/notifications/read | notifications/notifications.controller.ts:47 `markRead` | notifications/notifications.service.ts:101 `markRead` | любая сессия | `userId` в where `updateMany` | только default (Write снят намеренно, комментарий на notifications.controller.ts:46) | contract, notifications | — |
| GET /v1/me/notifications/summary | notifications/notifications.controller.ts:40 `summary` | notifications/notifications.service.ts:79 `summary` | любая сессия | `userId` | default | contract, accounts, notifications | notifications-e2e |
| GET /v1/me/oauth | oauth/oauth.controller.ts:102 `linked` | oauth/oauth.service.ts:167 `linked` | любая сессия | `auth.user.id` | default | contract, oauth | — |
| POST /v1/me/oauth/{provider}/link | oauth/oauth.controller.ts:108 `link` | oauth/oauth.service.ts:140 `link` | любая сессия | `auth.user.id` | Auth | contract, oauth | — |
| POST /v1/me/password | users/me.controller.ts:75 `changePassword` | users/account.service.ts:66 `changePassword` | любая сессия | своя запись | Auth + `LoginThrottle` (account.service.ts:78) | contract, access-matrix, account, login-throttle | — |
| PATCH /v1/me/preferences | users/me.controller.ts:63 `updatePreferences` | users/account.service.ts:51 `updatePreferences` | любая сессия | своя запись | Write | contract, access-matrix, account | ux-e2e.mjs |
| GET /v1/me/profile | contractors/profile.controller.ts:23 `get` | contractors/profile.service.ts:24 `get` | CONTRACTOR | `userId` из сессии | default | contract, access-matrix, bids, profile-concurrency | bids-integration.mjs |
| PUT /v1/me/profile | contractors/profile.controller.ts:29 `upsert` | contractors/profile.service.ts:28 `upsert` | CONTRACTOR | `userId` из сессии | Write | contract, access-matrix, bids, profile-concurrency | — |
| GET /v1/me/sessions | users/me.controller.ts:84 `sessions` | users/account.service.ts:109 `listSessions` | любая сессия | свои сессии | default | contract, access-matrix, account | — |
| POST /v1/me/sessions/revoke-others | users/me.controller.ts:99 `revokeOthers` | users/account.service.ts:143 `revokeOtherSessions` | любая сессия | `userId` в where | Write | contract, access-matrix, account | — |
| DELETE /v1/me/sessions/{id} | users/me.controller.ts:90 `revokeSession` | users/account.service.ts:124 `revokeSession` | любая сессия | `userId` в `deleteMany` (account.service.ts:131) | Write | contract, access-matrix, account | — |
| GET /v1/price-estimates | price-estimates/price-estimates.controller.ts:30 `list` | price-estimates/price-estimates.service.ts:63 `estimates` | любая сессия | — | default | contract, price-estimates | — |
| POST /v1/reports | moderation/moderation.controller.ts:66 `create` | moderation/reports.service.ts:27 `create` | любая сессия | `targetJob` (reports.service.ts:129): нельзя на свой заказ или своё сообщение; сообщение только из своей текущей сделки; отклик только к своему заказу | Write + 20 жалоб в сутки (reports.service.ts:49) | contract, accounts, moderation | accounts-e2e, schema-compat-flow |
| GET /v1/reports/mine | moderation/moderation.controller.ts:80 `mine` | moderation/reports.service.ts:88 `mine` | любая сессия | свои жалобы | default | contract, accounts | — |
| POST /v1/reports/mine/seen | moderation/moderation.controller.ts:90 `markSeen` | moderation/reports.service.ts:121 `markSeen` | любая сессия | свои жалобы | только default (без `@WriteRateLimited`) | contract, accounts | — |

---

## 2. Server Actions web

Все файлы с `'use server'` лежат в `apps/web/src/app/(site)/`. Origin проверяет `isTrustedOrigin` (`lib/action-guard.ts:8`), сессию проверяет `requireSessionToken` (`lib/action-helpers.ts:24`): без cookie сессии он перенаправляет на `/login?next=…`. «Обёртка» означает функцию `…FormAction`: она читает параметры из скрытого поля `args` и вызывает основное действие, а Origin и сессию проверяет это основное действие. Действия плана проверяют Origin и сессию в общей функции `prepare` (`account/plan/actions.ts:55`).

Сокращения тестов. vitest-файлы указаны от `apps/web/src/app/(site)/`; `trust-actions` означает `account/trust-actions.test.ts`. Сценарии `scripts/*.mjs` найдены поиском по названиям кнопок, страниц и вызовам `submit()`; построчно они не сверялись.

| Действие file:line | Что делает (маршрут API) | Origin | Сессия | Тесты |
|---|---|---|---|---|
| (auth)/actions.ts:83 `registerAction` | Регистрация, cookie сессии (POST /v1/auth/register) | да | нет (создаёт) | (auth)/actions.test.ts; cabinet-e2e, journey-e2e, ux-e2e |
| (auth)/actions.ts:117 `loginAction` | Вход (POST /v1/auth/login) | да | нет (создаёт) | (auth)/actions.test.ts; auth-integration, moderation-e2e, webkit-e2e |
| (auth)/actions.ts:143 `resetPasswordAction` | Новый пароль по ссылке и вход (POST /v1/auth/password-reset) | да | нет (токен из cookie) | trust-actions; accounts-e2e |
| (auth)/actions.ts:195 `completeBankAction` | Выбор роли после входа через банк (POST /v1/auth/oauth/complete) | да | нет (`pending` из cookie) | **нет** |
| (auth)/actions.ts:231 `logoutAction` | Выход, cookie удаляется после ответа API (POST /v1/auth/logout) | да | `getSessionToken` (без токена просто удаляет cookie) | (auth)/actions.test.ts; auth-integration, cabinet-e2e |
| admin/users/actions.ts:39 `issueResetLinkAction` | Ссылка для нового пароля (POST /v1/admin/users/{id}/password-reset) | да | да | trust-actions (через обёртку); accounts-e2e |
| admin/users/actions.ts:66 `issueResetLinkFormAction` | Обёртка → :39 | через :39 | через :39 | trust-actions; accounts-e2e |
| admin/leads/actions.ts:21 `setLeadProcessedAction` | Заявка обработана/новая (PATCH /v1/admin/leads/{id}) | да | да | admin/leads/actions.test.ts |
| admin/leads/actions.ts:50 `setLeadProcessedFormAction` | Обёртка → :21 | через :21 | через :21 | trust-actions |
| admin/reports/actions.ts:33 `resolveReportAction` | Закрыть жалобу (POST /v1/admin/reports/{id}/resolve) | да | да | account/reports/actions.test.ts; moderation-e2e |
| admin/reports/actions.ts:61 `setHiddenAction` | Скрыть/вернуть заказ, сообщение, отклик, отзыв (POST /v1/admin/{kind}/{id}/hidden) | да | да | account/reports/actions.test.ts; moderation-e2e |
| admin/reports/actions.ts:91 `setBlockedAction` | Блокировка аккаунта (POST /v1/admin/users/{id}/blocked) | да | да | account/reports/actions.test.ts; moderation-e2e |
| admin/reports/actions.ts:118 `resolveFlagAction` | Разбор пометки автопроверки (POST /v1/admin/flags/{id}/resolve) | да | да | trust-actions (через обёртку) |
| admin/reports/actions.ts:142 `resolveReportFormAction` | Обёртка → :33 | через :33 | через :33 | trust-actions; moderation-e2e |
| admin/reports/actions.ts:148 `setHiddenFormAction` | Обёртка → :61 | через :61 | через :61 | trust-actions; moderation-e2e |
| admin/reports/actions.ts:163 `setBlockedFormAction` | Обёртка → :91 | через :91 | через :91 | trust-actions; moderation-e2e |
| admin/reports/actions.ts:169 `resolveFlagFormAction` | Обёртка → :118 | через :118 | через :118 | trust-actions |
| account/jobs/actions.ts:51 `createJobAction` | Публикация заказа (POST /v1/me/jobs) | да | `getSessionToken`: без сессии возвращает «сессия закончилась», без redirect | account/jobs/actions.test.ts; jobs-integration, drafts-e2e, job-items-e2e, journey-e2e, mvp-e2e |
| account/jobs/actions.ts:71 `updateJobAction` | Правка заказа (PATCH /v1/me/jobs/{id}) | да | `getSessionToken` (как :51) | account/jobs/actions.test.ts; jobs-integration, mvp-e2e |
| account/jobs/actions.ts:107 `closeJobAction` | Закрыть заказ (POST /v1/me/jobs/{id}/close) | да | да | account/jobs/actions.test.ts; jobs-integration, journey-e2e, mvp-e2e |
| account/jobs/actions.ts:128 `acceptBidAction` | Выбрать исполнителя (POST /v1/me/jobs/{jobId}/bids/{bidId}/accept) | да | да | account/bids/actions.test.ts; bids-integration, cabinet-e2e, journey-e2e |
| account/jobs/actions.ts:162 `saveDraftAction` | Сохранить черновик из клиента (POST/PUT /v1/me/drafts) | да | `getSessionToken` (без redirect) | account/jobs/actions.test.ts; drafts-e2e, cabinet-e2e, journey-e2e, mvp-e2e |
| account/jobs/actions.ts:211 `deleteDraftAction` | Удалить черновик (DELETE /v1/me/drafts/{id}) | да (чужой источник: redirect без удаления) | да | account/jobs/actions.test.ts; drafts-e2e |
| account/jobs/actions.ts:230 `updateJobFormAction` | Обёртка → :71 | через :71 | через :71 | trust-actions; jobs-integration, mvp-e2e |
| account/jobs/actions.ts:236 `closeJobFormAction` | Обёртка → :107 | через :107 | через :107 | trust-actions; jobs-integration |
| account/jobs/actions.ts:242 `acceptBidFormAction` | Обёртка → :128 | через :128 | через :128 | trust-actions; bids-integration |
| account/jobs/actions.ts:248 `deleteDraftFormAction` | Обёртка → :211 | через :211 | через :211 | trust-actions; drafts-e2e |
| account/profile/actions.ts:17 `saveProfileAction` | Профиль мастера (PUT /v1/me/profile) | да | да | account/bids/actions.test.ts; bids-integration |
| account/plan/actions.ts:76 `savePlanAction` | Черновик плана; при `intent=propose` ещё и отправка (PUT /v1/jobs/{id}/plan + POST …/plan/propose) | да (`prepare`) | да (`prepare`) | account/plan/actions.test.ts; plan-e2e |
| account/plan/actions.ts:99 `setPlanAuthorAction` | Кто составляет план (POST …/plan/author) | да (`prepare`) | да | account/plan/actions.test.ts |
| account/plan/actions.ts:116 `approvePlanAction` | Согласовать план (POST …/plan/approve) | да (`prepare`) | да | account/plan/actions.test.ts; plan-e2e |
| account/plan/actions.ts:132 `returnPlanAction` | Вернуть план с причиной (POST …/plan/return) | да (`prepare`) | да | account/plan/actions.test.ts; plan-e2e |
| account/plan/actions.ts:158 `submitStageAction` | Сдать этап с фото (POST …/stages/{id}/submit) | да (`prepare`) | да | account/plan/actions.test.ts; chat-e2e, plan-e2e |
| account/plan/actions.ts:186 `acceptStageAction` | Принять этап (POST …/stages/{id}/accept) | да (`prepare`) | да | account/plan/actions.test.ts; plan-e2e |
| account/plan/actions.ts:202 `reworkStageAction` | Вернуть этап на доработку (POST …/stages/{id}/rework) | да (`prepare`) | да | account/plan/actions.test.ts; plan-e2e |
| account/plan/actions.ts:229 `quitJobAction` | Отказ исполнителя (POST …/quit) | да (`prepare`) | да | account/plan/actions.test.ts; plan-e2e |
| account/plan/actions.ts:253 `sendMessageAction` | Сообщение с фото (POST …/messages) | да (`prepare`) | да | account/plan/actions.test.ts; chat-e2e (а также accounts-e2e, moderation-e2e по кнопке «Отправить») |
| account/plan/actions.ts:292 `savePlanFormAction` | Обёртка → :76 | через :76 | через :76 | trust-actions; plan-e2e |
| account/plan/actions.ts:298 `setPlanAuthorFormAction` | Обёртка → :99 (проверяет значение `author`) | через :99 | через :99 | trust-actions |
| account/plan/actions.ts:311 `approvePlanFormAction` | Обёртка → :116 | через :116 | через :116 | trust-actions; plan-e2e |
| account/plan/actions.ts:317 `returnPlanFormAction` | Обёртка → :132 | через :132 | через :132 | trust-actions; plan-e2e |
| account/plan/actions.ts:323 `submitStageFormAction` | Обёртка → :158 | через :158 | через :158 | trust-actions; chat-e2e, plan-e2e |
| account/plan/actions.ts:329 `acceptStageFormAction` | Обёртка → :186 | через :186 | через :186 | trust-actions; plan-e2e |
| account/plan/actions.ts:335 `reworkStageFormAction` | Обёртка → :202 | через :202 | через :202 | trust-actions; plan-e2e |
| account/plan/actions.ts:341 `quitJobFormAction` | Обёртка → :229 | через :229 | через :229 | trust-actions; plan-e2e |
| account/plan/actions.ts:347 `sendMessageFormAction` | Обёртка → :253 | через :253 | через :253 | trust-actions; chat-e2e |
| account/reviews/actions.ts:27 `createReviewAction` | Отзыв об исполнителе (POST /v1/me/jobs/{jobId}/review) | да | да | trust-actions; accounts-e2e |
| account/notifications/actions.ts:22 `markAllReadAction` | Все уведомления прочитаны (POST /v1/me/notifications/read `{all}`) | да | да | account/notifications/actions.test.ts; notifications-e2e |
| account/notifications/actions.ts:45 `markJobSeenAction` | Уведомления заказа прочитаны, вызов из клиента (POST …/read `{jobId}`) | да | да | account/notifications/actions.test.ts; notifications-e2e |
| account/contacts/actions.ts:21 `contactsFormAction` | Показать или скрыть свои контакты (PUT/DELETE /v1/jobs/{jobId}/contacts) | да | да | trust-actions; accounts-e2e |
| account/settings/actions.ts:46 `profileAction` | Имя, телефон, город (PATCH /v1/me) | да | да | account/settings/actions.test.ts |
| account/settings/actions.ts:74 `preferencesAction` | Тема, масштаб, анимации (PATCH /v1/me/preferences) | да | да | account/settings/actions.test.ts (ux-e2e меняет тему прямым вызовом API) |
| account/settings/actions.ts:95 `passwordAction` | Смена пароля (POST /v1/me/password) | да | да | account/settings/actions.test.ts |
| account/settings/actions.ts:121 `revokeSessionAction` | Завершить один сеанс (DELETE /v1/me/sessions/{id}) | да | да | account/settings/actions.test.ts; ux-e2e |
| account/settings/actions.ts:139 `revokeOthersAction` | Завершить остальные сеансы (POST /v1/me/sessions/revoke-others) | да | да | account/settings/actions.test.ts |
| account/settings/actions.ts:158 `revokeSessionFormAction` | Обёртка → :121 | через :121 | через :121 | trust-actions; ux-e2e |
| account/reports/actions.ts:42 `reportAction` | Жалоба (POST /v1/reports); без JS итог передаётся в адресе | да | да | account/reports/actions.test.ts; moderation-e2e |
| account/reports/actions.ts:109 `markReportsSeenAction` | Решения по жалобам просмотрены (POST /v1/reports/mine/seen) | да | да | trust-actions; accounts-e2e |
| account/reports/actions.ts:122 `reportFormAction` | Обёртка → :42 | через :42 | через :42 | trust-actions; moderation-e2e |
| account/favorites/actions.ts:21 `favoriteFormAction` | В избранное и обратно (PUT/DELETE /v1/me/favorites/{jobId}) | да | да | trust-actions; accounts-e2e |
| account/bids/actions.ts:26 `placeBidAction` | Отклик (POST /v1/jobs/{jobId}/bids) | да | да | account/bids/actions.test.ts; bids-integration, accounts-e2e, cabinet-e2e, journey-e2e |
| account/bids/actions.ts:47 `withdrawBidAction` | Отозвать отклик (POST /v1/me/bids/{id}/withdraw) | да | да | account/bids/actions.test.ts |
| account/bids/actions.ts:70 `placeBidFormAction` | Обёртка → :26 | через :26 | через :26 | trust-actions; bids-integration |
| account/bids/actions.ts:76 `withdrawBidFormAction` | Обёртка → :47 | через :47 | через :47 | trust-actions |

Итого 64 действия: 41 проверяет Origin само (9 из них через `prepare`), 23 обёртки делегируют проверку. Оградительный тест `lib/no-bound-actions.test.ts` проверяет, что в `app/` и `components/` нет `.bind(null`.

---

## 3. Route Handlers web (`route.ts`)

| Путь | file:line | Метод | Проверки (Origin / сессия / прочее) | Тесты |
|---|---|---|---|---|
| /lead | (landing)/lead/route.ts:22 | POST | `isTrustedOrigin` (иначе 403); дальше API (`POST /v1/leads`) | (landing)/lead/route.test.ts; CI proxy (curl: 503 при выключенном приёме, 403 с чужим Origin; ci.yml:460-484) |
| /reset/[token] | (site)/(auth)/reset/[token]/route.ts:5 | GET | Origin нет. Сохраняет токен в cookie (`isResetToken`), 303 на /reset, `Referrer-Policy: no-referrer` | route не импортируется тестами; accounts-e2e проходит по `/reset/<token>` |
| /account/avatar | (site)/account/avatar/route.ts:21 | GET | сессия (`getSessionToken`, иначе 401) | (site)/account/avatar/route.test.ts |
| /account/avatar | (site)/account/avatar/route.ts:45 | POST | `isTrustedOrigin` (403) + сессия (401) + размер тела (413) | (site)/account/avatar/route.test.ts |
| /account/avatar | (site)/account/avatar/route.ts:76 | DELETE | `isTrustedOrigin` (403) + сессия (401) | **нет** (route.test.ts импортирует только POST и GET) |
| /account/notifications/summary | (site)/account/notifications/summary/route.ts:5 | GET | сессия (`getSessionToken`); только чтение | нет прямого теста (колокольчик опрашивает адрес, components/notification-bell.tsx:38) |
| /account/photos/[jobId]/[photoId] | (site)/account/photos/[jobId]/[photoId]/route.ts:11 | GET | проверка формата id + сессия (401); права проверяет API | chat-e2e.mjs:157, 165 (своему 200, чужому отказ) |
| /auth/[bank]/start | auth/[bank]/start/route.ts:16 | GET | для `mode=link` нужна сессия; state/nonce/PKCE сохраняются в cookie | нет теста маршрута (есть lib/bank-login.test.ts) |
| /auth/[bank]/callback | auth/[bank]/callback/route.ts:22 | GET | Origin нет. Код принимается только при совпадении `state` с cookie (`stateMatches`); cookie потока одноразовая (`takeBankFlow`); для `link` нужна сессия. **Меняет состояние на GET** (ставит cookie сессии или привязывает банк) | нет теста маршрута, нет сценария |
| /csp-report | csp-report/route.ts:16 | POST | Origin и сессии нет (отчёты шлёт браузер); проверка Content-Type (415), тело до 8000 байт (413), только журнал | lib/csp-report.test.ts (импортирует `POST`) |
| /gate/check | gate/check/route.ts:17 | GET | проверка cookie пропуска тестировщика (для `forward_auth` Caddy) | gate/check/route.test.ts; CI proxy (curl) |
| /gate/login | gate/login/route.ts:37 | POST | `isSameOriginRequest` (gate/login/route.ts:42), тело до 2000 байт, лимит попыток по IP, проверка пароля | gate/login/route.test.ts; CI proxy (ci.yml:406+); landing-e2e (страница /gate) |

---

## 4. Страницы (`page.tsx`)

Ролевые страницы используют `requireRolePage` (`lib/customer.ts:31`). Без сессии они перенаправляют на `/login?next=…`. При другой роли страница получает `token: null` и показывает пояснение; права всё равно проверяет API. В production закрытое тестирование: без пропуска тестировщика открыты только `/`, `/offline`, `/privacy`, `/gate` (GET) и POST `/lead`, `/gate/login` (`deploy/Caddyfile:36-44`).

| Путь | Файл (от apps/web/src/app/) | Кто открывает | Без JS |
|---|---|---|---|
| / | (landing)/page.tsx | публичная | Форма заявки `LeadForm` работает только с JS: `<form onSubmit>` без `action`/`method` (components/landing/lead-form.tsx:90), отправка через `fetch('/lead')` |
| /privacy | (landing)/privacy/page.tsx | публичная | статическая |
| /login | (site)/(auth)/login/page.tsx | публичная; вошедшего перенаправляет | Server Action `loginAction` |
| /register | (site)/(auth)/register/page.tsx | публичная; вошедшего перенаправляет на /account | `registerAction`, `completeBankAction` |
| /reset | (site)/(auth)/reset/page.tsx | публичная (токен из cookie) | `resetPasswordAction` |
| /account | (site)/account/page.tsx | любая сессия | `logoutAction` |
| /account/bids | (site)/account/bids/page.tsx | CONTRACTOR | обёртки откликов (`args`) |
| /account/cart | (site)/account/cart/page.tsx | **без проверки сессии** (заглушка `ComingSoon`, отдельного layout у /account нет) | статическая |
| /account/chats | (site)/account/chats/page.tsx | любая сессия | — |
| /account/favorites | (site)/account/favorites/page.tsx | любая сессия | `favoriteFormAction` |
| /account/jobs | (site)/account/jobs/page.tsx | CUSTOMER | `deleteDraftFormAction` |
| /account/jobs/new | (site)/account/jobs/new/page.tsx | CUSTOMER | `createJobAction`; автосохранение черновика (`saveDraftAction`) только с JS |
| /account/jobs/[id] | (site)/account/jobs/[id]/page.tsx | CUSTOMER; чужой заказ даёт `notFound()` по ответу API | `updateJobFormAction`, `closeJobFormAction`, `acceptBidFormAction`, план, чат, контакты, отзыв |
| /account/notifications | (site)/account/notifications/page.tsx | любая сессия | `markAllReadAction` |
| /account/profile | (site)/account/profile/page.tsx | CONTRACTOR | `saveProfileAction` |
| /account/reports | (site)/account/reports/page.tsx | любая сессия | `markReportsSeenAction` вызывается из клиента |
| /account/settings | (site)/account/settings/page.tsx | любая сессия | формы настроек (Server Actions); фото профиля только с JS (`fetch('/account/avatar')`, components/account/avatar-uploader.tsx:43, 65) |
| /account/work/[jobId] | (site)/account/work/[jobId]/page.tsx | CONTRACTOR; без сделки `notFound()` | план, этапы, чат, контакты, отказ |
| /admin/analytics | (site)/admin/analytics/page.tsx | ADMIN | — |
| /admin/leads | (site)/admin/leads/page.tsx | ADMIN | `setLeadProcessedFormAction` |
| /admin/reports | (site)/admin/reports/page.tsx | ADMIN | обёртки модерации |
| /admin/users | (site)/admin/users/page.tsx | ADMIN | поиск: `<form method="get">`; `issueResetLinkFormAction`, `setBlockedFormAction` |
| /contractors/[publicId] | (site)/contractors/[publicId]/page.tsx | публичная | — |
| /jobs | (site)/jobs/(catalog)/page.tsx | публичная | поиск и фильтры: `<form action="/jobs" method="get">` (components/catalog-search.tsx:77, header-search.tsx:73) |
| /jobs/[id] | (site)/jobs/[id]/page.tsx | публичная; содержимое зависит от роли | `placeBidFormAction`, `favoriteFormAction`, `reportFormAction` |
| /gate | gate/page.tsx | публичная | `<form method="post" action="/gate/login">` |
| /offline | offline/page.tsx | публичная | статическая |

---

## 5. Модели Prisma

Схема: `apps/api/prisma/schema.prisma`. У всех `@relation(fields: …)` явно задан `onDelete` (поиск строк без `onDelete` ничего не нашёл).

| Модель (строка) | Таблица | Ключи, unique, индексы | onDelete к User | onDelete к Job |
|---|---|---|---|---|
| Job (:100) | jobs | PK id; unique(ownerId, requestId); индексы (createdAt, id), (ownerId, createdAt), GIN categories, trgm title/description/city; частичный `jobs_open_created_at_idx` (только SQL, миграция 20261019120000) | owner: **Restrict** (ownerId может быть null) | — |
| JobDraft (:161) | job_drafts | индекс (ownerId, updatedAt) | Cascade | — |
| User (:182) | users | unique email, unique publicId; CHECK email в нижнем регистре, формат телефона, ui_* | — | — |
| Session (:234) | sessions | unique tokenHash; индексы userId, expiresAt | Cascade | — |
| ExternalAccount (:259) | external_accounts | unique(provider, subject), unique(userId, provider) | Cascade | — |
| AuditLog (:275) | audit_logs | индексы (entityType, entityId, createdAt), (actorId, createdAt), (action, createdAt) | actor: SetNull | — |
| ContractorProfile (:294) | contractor_profiles | PK userId | Cascade | — |
| Bid (:308) | bids | unique(jobId, contractorId); индексы (contractorId, createdAt), (jobId, status); частичный unique `bids_one_accepted_per_job` WHERE status='ACCEPTED' (только SQL, 20261015213341_contractor_profiles_bids/migration.sql:70) | contractor: **Restrict** | job: **Restrict** |
| JobPlan (:359) | job_plans | unique jobId | — | Cascade |
| JobStage (:381) | job_stages | unique(planId, position); plan Cascade | — | (через JobPlan) |
| Lead (:404) | leads | индексы createdAt, (phone, createdAt); связей нет | — | — |
| UserAvatar (:420) | user_avatars | PK userId; CHECK размер ≤ 512 КБ | Cascade | — |
| JobMessage (:432) | job_messages | unique(authorId, requestId); индекс (jobId, contractorId, createdAt) | contractor: Cascade; author: Cascade | Cascade |
| JobPhoto (:459) | job_photos | индексы stageId, messageId, jobId; CHECK «ровно одно из stage/message» | contractor: Cascade; uploader: Cascade | Cascade (stage и message тоже Cascade) |
| JobPhotoBlob (:487) | job_photo_blobs | PK photoId; photo Cascade | — | (через JobPhoto) |
| Notification (:517) | notifications | индексы (userId, createdAt, id), jobId; частичные `notifications_unread_idx` и unique `notifications_message_unread_key` (только SQL, описаны в комментарии schema.prisma:534) | Cascade | Cascade |
| Report (:563) | reports | индексы (status, createdAt), (reporterId, createdAt), jobId; частичный unique `reports_open_key` (только SQL, комментарий schema.prisma:588) | reporter: Cascade; resolvedBy: SetNull | Cascade |
| PasswordReset (:595) | password_resets | unique tokenHash; индекс userId | user: Cascade; issuedBy: SetNull | — |
| Review (:612) | reviews | unique jobId; индекс (contractorId, createdAt); CHECK author ≠ contractor | author: Cascade; contractor: Cascade | Cascade |
| FavoriteJob (:631) | favorite_jobs | PK(userId, jobId); индекс (userId, createdAt) | Cascade | Cascade |
| ContactShare (:645) | contact_shares | PK(bidId, userId); индекс userId; bid Cascade | Cascade | (через Bid) |
| LoginFailure (:660) | login_failures | PK emailHash; индекс lastAt | — | — |
| UsageCounter (:671) | usage_counters | PK(day, metric) | — | — |
| ContentFlag (:682) | content_flags | unique(targetType, targetId); индекс (status, createdAt) | author: Cascade; resolvedBy: SetNull | Cascade |

**Триггеры и функции из миграций:**

| Объект | Миграция file:line | Назначение |
|---|---|---|
| FUNCTION `jobs_sync_categories()` + TRIGGER `jobs_sync_categories` BEFORE INSERT OR UPDATE OF category, extra_items, categories ON jobs | 20261018140000_job_extra_items/migration.sql:7, 17 | Список `categories` ведёт база: основная категория первой, затем категории позиций |
| FUNCTION `refuse_session_for_blocked_user()` + TRIGGER `sessions_refuse_blocked_user` BEFORE INSERT ON sessions | 20261024100000_accounts_reviews/migration.sql:135, 145 | Заблокированному аккаунту база не даёт создать сессию (защита при откате API) |
| EXTENSION `pg_trgm` | 20261019120000_catalog_search_indexes/migration.sql:6 | Поиск каталога ILIKE |

---

## 6. Фоновые задачи и скрипты сервера

**API (Nest, `OnModuleInit`):**

| Задача | file:line | Что делает | Тест |
|---|---|---|---|
| `CleanupService` | maintenance/cleanup.service.ts:28-33 (`setInterval`, `CLEANUP_INTERVAL_MIN`, по умолчанию 60 мин; 0 выключает) | Удаляет истёкшие сессии, ссылки сброса старше 7 дней, закончившиеся серии неверных паролей (`run`, :39) | login-throttle.e2e-spec.ts:194 (вызывает `run(now)`) |
| `UsageCounters` | analytics/usage.ts:30-31 (`setInterval` 30 с; сброс и при остановке, :36) | Пишет в базу счётчики просмотров и черновиков | analytics.e2e-spec.ts:145-161 (`flush()`) |
| `PrismaService.onModuleInit` | prisma/prisma.service.ts:6 | `$connect` при старте | косвенно, все e2e |
| Отметка `lastSeenAt` | auth/auth.service.ts:152-156 | Без ожидания обновляет время последнего входа (не таймер) | не проверено отдельно |

**Web (только в браузере):** опрос колокольчика (`components/notification-bell.tsx:46`, `setInterval`) и автообновление чата (`components/chat/auto-refresh.tsx:16`).

**Скрипты `deploy/autodeploy/`** (тест — разделы `scripts/autodeploy-test.sh`):

| Скрипт | Назначение | Тест |
|---|---|---|
| deploy.sh | Автообновление из main по таймеру (каждые 2 мин): строгий CI gate по SHA, только слитый PR, сборка, переключение, проверка здоровья, повторы, копия перед миграцией | autodeploy-test.sh разделы 1–12б (строки 193–377), 13 (461), 14 (378–450) |
| ci_gate.py | Разбор ответов GitHub Actions: обязательные задачи по SHA, проверка PR | косвенно через deploy.sh, разделы 1–7a (строки 193–317) |
| lib.sh | Общие функции, список обязательных задач CI (`REQUIRED_JOBS`) | косвенно (подключается остальными скриптами) |
| notify.sh | Уведомления владельцу (Telegram, вебхук) | раздел 15 (строки 542–558) |
| monitor.sh | Ежечасные проверки (диск, сертификат, время, сайт, копии), сигнал «жив» внешнему монитору | раздел 15 (строки 551–606) |
| rollback.sh | Откат на прошлые образы с проверкой совместимости миграций | строки 434–450 и раздел 16 (607–688); scripts/drills.sh (CI drills) |
| readiness.sh | Проверка готовности GO/NO-GO, только чтение | раздел «15. Готовность» (строки 689–803) |
| ruleset_check.py | Проверка правил защиты main в GitHub | косвенно через readiness.sh (строки 689–803) |
| migration-check.sh + migration_check.py | Белый список безопасных операций в миграциях (`-- rollback-safe`) | scripts/migration-check-test.sh; CI шаг ci.yml:84 (только PR) |
| install.sh | Установка таймеров systemd (deploy, backup, restore-check, monitor) | **нет** (только shellcheck, ci.yml:94) |
| inventory.sh | Отчёт о состоянии сервера, только чтение | **нет** (только shellcheck) |

Скрипты `deploy/backup/` (backup.sh, restore-check.sh, offsite-restore-check.sh) проверяются в autodeploy-test.sh (строки 451–541) и scripts/drills.sh.

---

## 7. Задачи CI (`.github/workflows/ci.yml`)

Запускается на `pull_request` и на `push` в main (ci.yml:3-6).

| Задача (строка) | Что запускает |
|---|---|
| `verify` «Lint, typecheck, test, build» (:16) | `pnpm audit --prod`; `pnpm lint`; `pnpm typecheck`; jest API с покрытием (`src/**/*.spec.ts` и все `test/*.e2e-spec.ts`, apps/api/jest.config.js:5); vitest web с покрытием; **только PR:** migration-check.sh (:84); shellcheck + `scripts/autodeploy-test.sh` + `scripts/migration-check-test.sh` (:92); `pnpm build`; актуальность openapi.json и сгенерированных типов (:103); `prisma migrate diff` схема и миграции (:111); migrate deploy + seed дважды (:119); **только PR:** `scripts/schema-compat-test.sh` (:127); Chromium; на production-сборке: `pnpm smoke`, jobs-integration, bids-integration, drafts-e2e, job-items-e2e, mvp-e2e, cabinet-e2e, journey-e2e, plan-e2e, chat-e2e, notifications-e2e, moderation-e2e, accounts-e2e, price-estimate-e2e, ux-e2e, webkit-e2e, landing-e2e (за Caddy), auth-integration (:141) |
| `docker` «Docker stack (compose)» (:214) | Сборка образов, `scripts/image-secrets-check.sh` (подложенные секреты не попали в образы), smoke.mjs, jobs-integration.mjs, bids-integration.mjs против контейнеров, проверка подмены IP из соседнего контейнера (:290) |
| `drills` «Disaster drills» (:317) | `scripts/drills.sh`: копия и восстановление (в том числе вне сервера через age и rclone), сломанное обновление и откат, несовместимая миграция |
| `proxy` «Docker stack behind Caddy» (:364) | `scripts/check-deploy-ports.mjs` (порты публикует только Caddy); curl-проверки: пароль тестировщика `/gate/login`, `/gate/check`, HTTPS/HSTS, закрытые порты 3000/4000, открытые адреса, POST /lead (503/403), Server Action на `/` без пропуска даёт 401 |

---

## 8. Пробелы

**Статус после серии PR по аудиту 23.10.2026** (подробности — `SECURITY_MATRIX.md`):

| № | Статус |
|---|---|
| 1–2 | Открыто: маршруты покрыты контрактом и e2e API, браузерного сценария нет. Не блокирует бету. |
| 3 | Пояснение добавлено в код для `POST /v1/reports/mine/seen` (повтор ничего не меняет, вызывается сам). |
| 4 | Принятый риск: один экземпляр API (`docs/SECURITY.md`, раздел 2). |
| 5 | Закреплено тестом `apps/web/src/lib/server-actions-guard.test.ts`. |
| 6–7 | Открыто: только vitest. Вход через банк выключен без ключей. |
| 8, 10 | Намеренно (state + PKCE; перенос токена ссылки в cookie), описано в `SECURITY_MATRIX.md`. |
| 9 | Открыто: нет теста маршрута; вход через банк выключен без ключей. |
| 11–12 | Исправлено: тесты `DELETE /account/avatar` и сводки уведомлений. |
| 13 | Намеренно. |
| 14 | Неверно: `/account/cart` — заглушка `ComingSoon`, она сама уводит на вход без сессии. |
| 15 | Исправлено и проверено в браузере: форма заявки без JS отправляет POST, имя и телефон в адрес не попадают. |
| 16 | Удаление аккаунта сделано обезличиванием (строка пользователя остаётся), `docs/ACCOUNTS.md`. |
| 17 | Исправлено: индекс описан в `schema.prisma`. |
| 18–19 | Открыто, низкий риск: см. `INDEPENDENT_FULL_AUDIT_2026-10-23.md`. |

Исходный текст пробелов на `4fca28f`:

Здесь только то, что подтверждено чтением кода и поиском (grep). То, что не проверялось построчно, помечено «не проверено».

**Маршруты API**

1. Два маршрута проверяет только контрактный тест `contract.e2e-spec.ts`; отдельного e2e нет ни у одного из них:
   - `GET /health/ready` (contract.e2e-spec.ts:96, 1535);
   - `POST /v1/admin/flags/{id}/resolve` (contract.e2e-spec.ts:1152). Сценарием `scripts/*.mjs` этот маршрут тоже не покрыт: `accounts-e2e` открывает вид флагов, но кнопок «Меры приняты/Нарушения нет» не нажимает.
2. Маршруты без браузерного сценария: ни прямого вызова из `scripts/*.mjs`, ни Server Action, найденного в сценариях по ключевым словам (не проверено построчно):
   - банковский вход: `POST /v1/auth/oauth/{provider}/authorize|callback`, `POST /v1/auth/oauth/complete`, `GET /v1/auth/oauth/providers`, `GET /v1/me/oauth`, `POST /v1/me/oauth/{provider}/link`;
   - `POST /v1/admin/flags/{id}/resolve`;
   - `GET /v1/admin/leads`, `PATCH /v1/admin/leads/{id}`: ни один сценарий не открывает /admin/leads;
   - `POST /v1/me/bids/{bidId}/withdraw`;
   - `POST /v1/jobs/{jobId}/plan/author`;
   - `POST /v1/me/password`;
   - `POST /v1/me/sessions/revoke-others`;
   - `DELETE /v1/me/avatar`, `GET /v1/me/avatar`.
3. Два изменяющих маршрута работают без `@WriteRateLimited`, им действует только общий лимит 120 запросов в минуту:
   - `POST /v1/reports/mine/seen` (moderation.controller.ts:90): пояснения в коде нет;
   - `POST /v1/me/notifications/read` (notifications.controller.ts:47): снят намеренно, это объяснено в комментарии на строке 46.
4. Счётчики лимитов хранятся в памяти процесса (app.module.ts:35). Это корректно только для одного экземпляра API.

**Server Actions**

5. Действий без проверки Origin нет. Все 41 основное действие вызывают `isTrustedOrigin` сами или через `prepare`, а 23 обёртки только передают вызов основному действию.
6. У `completeBankAction` ((auth)/actions.ts:195) нет ни vitest-теста, ни сценария.
7. Действия без браузерного сценария, есть только vitest:
   - `setLeadProcessedAction` и обёртка;
   - `resolveFlagAction` и обёртка;
   - `setPlanAuthorAction` и обёртка;
   - `withdrawBidAction` и обёртка;
   - `profileAction`, `preferencesAction`, `passwordAction`, `revokeOthersAction`.

**Route Handlers**

8. `GET /auth/[bank]/callback` (auth/[bank]/callback/route.ts:22) меняет состояние по GET: ставит cookie сессии или привязывает банк к аккаунту. Защищает его только `state` из cookie браузера и PKCE, Origin не проверяется. Теста маршрута и сценария нет.
9. У `GET /auth/[bank]/start` нет теста маршрута.
10. `GET /reset/[token]` ставит cookie токена сброса по GET без проверки источника. Маршрут не импортирует ни один тест, есть только проход в `accounts-e2e`.
11. У `DELETE /account/avatar` (avatar/route.ts:76) нет теста: `route.test.ts` импортирует только `POST` и `GET`.
12. У `GET /account/notifications/summary` нет теста маршрута. Покрытие через колокольчик в notifications-e2e/accounts-e2e не проверено.
13. `POST /csp-report` не проверяет ни Origin, ни сессию. Это сделано намеренно (отчёты шлёт браузер); тело ограничено 8000 байт и типом содержимого.

**Страницы**

14. `/account/cart` открывается без проверки сессии: заглушка, общего layout с проверкой у /account нет. В production страницу закрывает только пароль тестировщика Caddy.
15. Без JS форма заявки на главной не работает. У `<form onSubmit>` (components/landing/lead-form.tsx:90) нет `action` и `method`, поэтому браузер отправит GET на текущий адрес, и `name` и `phone` попадут в адресную строку. Это вывод из разметки, в браузере не проверено. Фото профиля без JS загрузить тоже нельзя.

**Prisma**

16. Связей с User без явного `onDelete` нет. Но `Job.owner`, `Bid.contractor` и `Bid.job` стоят на **Restrict**: пользователя с заказами или откликами, как и заказ с откликами, удалить нельзя. Кода удаления пользователя в `apps/api/src` нет (grep `user.delete` пуст).
17. Частичный уникальный индекс `bids_one_accepted_per_job` есть только в SQL (20261015213341_contractor_profiles_bids/migration.sql:70), в комментариях schema.prisma он не упомянут. При этом ci.yml:110 утверждает, что частичные индексы перечислены в комментариях schema.prisma (см. также docs/AUDIT_FINDINGS.md:229, ARCH-8). Остальные частичные индексы (`jobs_open_created_at_idx`, `notifications_*`, `reports_open_key`) в комментариях есть.

**Сервер и CI**

18. `deploy/autodeploy/install.sh` и `inventory.sh` в `autodeploy-test.sh` не проверяются, CI прогоняет для них только shellcheck. `ci_gate.py` и `ruleset_check.py` проверяются только косвенно, через deploy.sh и readiness.sh.
19. Проверки совместимости миграций (ci.yml:84, `migration-check.sh`) и обновления схемы на старых данных (ci.yml:127, `schema-compat-test.sh`) идут только в `pull_request`, при push в main они пропускаются.
