# Architecture Decision Records

Короткие записи об архитектурных решениях: контекст, решение, последствия, альтернативы.
Статусы: **Предложено** (ждёт согласования владельца и ревью) → **Принято** → **Заменено**.
Принятое решение меняется только новым ADR, который ссылается на старый.

| № | Решение | Статус |
| --- | --- | --- |
| [0001](0001-api-versioning-and-openapi.md) | Версионирование API, совместимость, депрекация и OpenAPI | Принято |
| [0002](0002-api-error-format.md) | Единый формат ошибок API с машинным `code` | Принято |
| [0003](0003-shared-contracts-and-generated-types.md) | Общие контракты: `packages/shared` и типы из OpenAPI | Принято |
| [0004](0004-next-bff-role-and-deeplinks.md) | Роль Next.js как BFF, граница web/mobile, deeplink'и | Принято |
| [0005](0005-future-chat-files-notifications-deals.md) | Интерфейсы будущих чата, файлов, уведомлений и сделок | Принято как направление |
| [0006](0006-job-questionnaire-and-service-area.md) | Анкета заказа: обязательность, legacy-заказы, зона обслуживания | Принято |

Контекст всех записей: `docs/MOBILE_READINESS_AUDIT.md`, ТЗ `docs/MOBILE_READY_TZ.md` (PR #9),
Issue #10.
