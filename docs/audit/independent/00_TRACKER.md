# Независимый аудит — журнал и покрытие
**Целевой SHA:** `89614b5702b13435f05d9e1dbc7f126abdaa6801` (на момент старта); **база ZIP:** `4fca28f1b30d35d5b62e3e3ff0f6e68d84f5377e`. Не переносить статусы старой базы на новые blob SHA.

## Правила
Каждый file/blob: NOT_STARTED → IN_PROGRESS → REVIEWED_STATIC → TESTED (если реально выполнен) / FINDING / BLOCKED. "REVIEWED_STATIC" не означает отсутствие всех возможных ошибок. Для каждого этапа: paths, SHA, анализ методов, зависимости, ошибки, тесты, evidence. Новый main — только через diff и повторную проверку. В main без разрешения не сливать.

## Полнота
Получено полное Git-tree прежней базы: **600 файлов, 159 деревьев, truncated=false**. Области: 210 API, 259 web, 23 shared, 23 deploy, 34 docs, 34 scripts, 2 CI, 15 прочее. 20 контроллеров, 23 service-файла, 24 SQL migrations, 14 Server Actions и 94 файлов тестов **на базовом SHA**. Машинная инвентаризация старой базы доступна в ранее подготовленном отчёте; эти числа не следует объявлять количеством файлов актуального main без новой tree-сверки.

## Этапы (ответственный за продолжение — следующий независимый аудит)
01 конфигурация/архитектура, 02 auth/session/role, 03 аккаунты/ПД, 04 заказ/черновик, 05 каталог/цены, 06 отклики, 07 планы/контакты, 08 чат/фото, 09 отзывы/модерация, 10 feedback/notifications/analytics, 11 Prisma/SQL, 12 Next/Server Actions, 13 тесты, 14 Docker/Caddy/CI/backup, 15 межмодульные сценарии, 16 финальная приёмка.

## Обязательные release gates
Critical/High=0 по подтверждённым дефектам; 100% критичных P0 сценариев с evidences; полный перечень NOT VERIFIED; текущая версия VPS, GitHub ruleset, реальный offsite-restore, доставка мониторинга, правовые основания ПД. Until evidence: beta NO-GO.

## Выполнено
- 01-А: package scripts, workspace, app.module, Next headers, базовая архитектура.
- 01-Б: прочитаны на целевом SHA `apps/api/src/config/env.ts`, `apps/api/src/setup-app.ts`, `apps/web/src/lib/csp.ts`, `deploy/Caddyfile`, `deploy/docker-compose.yml`, `deploy/docker-compose.proxy.yml`, `Dockerfile`, `.github/workflows/ci.yml`, `.dockerignore`. Функциональная проверка CI или VPS локально не запускалась.
- Все остальные этапы: NOT_STARTED; оставшаяся часть 01: lockfile, runtime configs and scripts.

## Находки
- AUD-01 [MEDIUM, условный]: `apps/api/src/app.module.ts`: NestJS throttler хранит состояние в памяти. Лимиты не общие при более чем одном API инстансе; для текущего single instance допустимо с явным release-ограничением.
- AUD-02 [MEDIUM, конфигурация]: `apps/web/src/lib/csp.ts:9`: `Content-Security-Policy-Report-Only`; production script-src разрешает `unsafe-inline`. Нарушения только журналируются, не блокируются. Переход к enforce после browser compatibility tests и nonce/hash. Наличие report-only само по себе не доказывает XSS.
- AUD-03 [LOW, условный]: корневой dev compose допускает dev пароль Postgres по умолчанию; production файл требует переменную. Не использовать dev compose на VPS.
- AUD-04 [LOW]: Node engines >=22, Docker Node 22 digest: будущие major не проверены; уточнить поддерживаемую матрицу.
- AUD-05 [INFO]: `deploy/Caddyfile` ограничивает body 8MB кроме путей заказа/хода работ 27MB; `forward_auth` защищает private requests, для открытых POST разрешены только /lead и /gate/login. Нужны динамические HTTP tests с double-encoding, URL normalization, RSC, Server Actions, HEAD/OPTIONS, чтобы исключить обход.
- AUD-06 [INFO]: `config/env.ts` отклоняет wildcard CORS и trustProxy=true; это хорошие меры. Их достаточно только при верном числе реально доверенных proxy hops.

## План следующего прохода
Сверить dependency lockfile и root/CI конфигурации целевого SHA, затем этап 02: auth/session guards/password reset/roles/OAuth с матрицей ролей и тестов. Создавать дополнительные отчёты в `docs/audit/independent/`, обновлять этот журнал, PR не сливать.

**Разграничение доказательств:** file-tree inventory и static review выполнены; typecheck/test/deploy/VPS в этом проходе НЕ выполнялись.