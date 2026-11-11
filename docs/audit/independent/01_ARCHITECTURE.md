# Этап 01 — аудит конфигурации и границ системы
**Review target:** `89614b5702b13435f05d9e1dbc7f126abdaa6801`. **Статус:** IN PROGRESS.

## Прочитанные исходники
`package.json`, `pnpm-workspace.yaml`, `apps/api/src/app.module.ts`, `apps/api/src/config/env.ts`, `apps/api/src/setup-app.ts`, `apps/web/next.config.ts`, `apps/web/src/lib/csp.ts`, `deploy/Caddyfile`, `deploy/docker-compose.yml`, `deploy/docker-compose.proxy.yml`, `Dockerfile`, `.github/workflows/ci.yml`, `.dockerignore`. Часть файлов была проверена ранее по baseline ZIP и требует повторной сверки на актуальном SHA.

## Подтверждено
1. pnpm workspace `apps/*` + `packages/*`; сборка, lint, тесты и генерация OpenAPI описаны корневыми скриптами.
2. Декларация Node >=22, Docker image Node 22 закреплён digest, непривилегированный `USER node` в API/web этапах образа.
3. `app.module.ts`: global ThrottlerGuard; лимиты default/auth/write в памяти процесса, осознанное single-instance условие.
4. `config/env.ts`: CORS без wildcard, production только https origin, запрещён `TRUST_PROXY=true`; явная валидация hop count и env ranges.
5. `setup-app.ts`: helmet, CORS с GET/HEAD/OPTIONS, настройка Express trust proxy, глобальная валидация и error handler.
6. `next.config.ts`: базовые заголовки безопасности, лимит Server Actions 27MB, кэширование версионированных статических landing ресурсов.
7. `csp.ts:9`: report-only в production и dev; `script-src` включает `unsafe-inline`, `unsafe-eval` только dev.
8. `deploy/Caddyfile`: forward_auth для приватной части, явные исключения для публичного чтения и двух POST route handlers, HSTS, размер тела по path; реальное поведение проверять на работающем сервере.
9. `.github/workflows/ci.yml`: CI включает pnpm audit --prod --audit-level high, lint, typecheck, coverage, compose, proxy и disaster drills. Существование шага не доказывает, что он запускался по SHA этой аудиторской ветки.

## Риски
- AUD-01: multi-instance rate limits (MEDIUM conditional).
- AUD-02: CSP не блокирует нарушения, unsafe-inline (MEDIUM, defense-in-depth).
- AUD-03: dev db password only in dev compose (LOW configuration boundary).
- AUD-04: Node engines >=22 vs pinned 22 (LOW reproducibility).
- AUD-05: Caddy path/method exceptions требуют динамического bypass testing (INFO, не подтверждённая уязвимость).

## Что нельзя пока заключить
Нет доказанной эксплуатации уязвимостей, самостоятельного `pnpm audit`, запуска тестов, Docker, HTTPS smoke, production backup/restore. Не утверждать security PASS всего релиза.

## Следующий пакет
`pnpm-lock.yaml`, `apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json`, соответствующие tsconfig/eslint, затем этап 02 auth.
