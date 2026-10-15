# Agregator Remont

Маркетплейс услуг ремонта и строительства. Текущий этап: **Фаза 0**, публичный каталог заказов
(см. [docs/ROADMAP.md](docs/ROADMAP.md), [docs/CLAUDE_START.md](docs/CLAUDE_START.md)).

## Состав

| Путь                 | Что это                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `apps/web`           | Next.js 16 (App Router, TypeScript, Tailwind CSS 4, PWA), порт 3000   |
| `apps/api`           | NestJS 11 + Prisma 6 + PostgreSQL 16, порт 4000                       |
| `packages/shared`    | Общий контракт API: типы `JobDto`, `Paginated<T>`, категории, статусы |
| `docker-compose.yml` | PostgreSQL для локальной разработки (+ отдельная БД `agregator_test`) |

Web получает данные только через настоящий API (серверные запросы из React Server Components),
моков нет.

## Требования

- Node.js 22 (`.nvmrc`), pnpm 10 (`corepack enable`)
- Docker (для PostgreSQL) или свой PostgreSQL 16

## Быстрый старт

```bash
corepack enable
pnpm install
cp .env.example .env

pnpm db:up        # PostgreSQL в Docker (создаёт БД agregator и agregator_test)
pnpm db:deploy    # применить миграции
pnpm db:seed      # 16 демонстрационных заказов (идемпотентно)

pnpm dev          # API http://localhost:4000 + web http://localhost:3000
```

Production-сборка локально:

```bash
pnpm build
pnpm start        # оба приложения, переменные из .env
```

Если PostgreSQL свой, а не из Docker: создайте БД `agregator` и `agregator_test` и поправьте
`DATABASE_URL` / `TEST_DATABASE_URL` в `.env`.

## Проверки (то же, что в CI)

```bash
pnpm lint         # ESLint + Prettier --check
pnpm typecheck    # tsc во всех пакетах
pnpm test         # API: Jest + supertest на реальной БД agregator_test; web: Vitest
pnpm build
pnpm audit --prod --audit-level high
```

Тесты API применяют миграции к `TEST_DATABASE_URL` и **очищают таблицу `jobs`** в ней.
Защита: тесты откажутся запускаться, если имя БД не оканчивается на `_test`.

## API

| Метод | Путь                         | Ответ                                                    |
| ----- | ---------------------------- | -------------------------------------------------------- |
| GET   | `/health`                    | `{"status":"ok"}`                                        |
| GET   | `/v1/jobs?page=1&limit=12`   | `{items, page, limit, total}`, сортировка: новые первыми |
| GET   | `/v1/jobs?category=PLUMBING` | фильтр по категории (необязательный)                     |
| GET   | `/v1/jobs/:id`               | заказ или `404 {"message":"Заказ не найден"}`            |

Валидация query: `page` целое 1..10000, `limit` целое 1..50 (по умолчанию 12), `category` из
списка. Неизвестные параметры, дробные/отрицательные/повторяющиеся значения дают `400`.

Модель `Job`: `id, title, description, category, city, budgetMin, budgetMax, currency (RUB),
status (OPEN | IN_PROGRESS | CLOSED), createdAt`. Бюджет хранится в целых рублях, `null` означает
«по договорённости»; целостность диапазона закреплена `CHECK`-ограничениями в БД.

```bash
curl -s localhost:4000/health
curl -s 'localhost:4000/v1/jobs?page=1&limit=2'
curl -s localhost:4000/v1/jobs/demo-job-01
```

## Smoke-тест production-сборки

```bash
pnpm build && pnpm start   # в отдельном терминале
pnpm smoke                 # HTTP-коды, рендер данных из API, 404, заголовки безопасности и CSP
```

## Аккаунты

Web: `/register`, `/login`, `/account`. Сессия хранится в HttpOnly-cookie, web передаёт её API как
`Authorization: Bearer`. Подробности и ограничения: [docs/SECURITY.md](docs/SECURITY.md), раздел 5.

## Безопасность (что сделано на этом этапе)

Подробности, исключения по зависимостям и гейт для write-эндпоинтов: [docs/SECURITY.md](docs/SECURITY.md).
Развёртывание, reverse proxy, `TRUST_PROXY`, healthchecks: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

- `helmet` (заголовки безопасности), CORS только для точных origin'ов из `CORS_ORIGINS` (`*` запрещён, в production только https).
- Rate limit 120 запросов/мин на IP (in-memory, **только один инстанс**); `TRUST_PROXY` для работы за reverse proxy.
- Ответ API формируется через явный whitelist полей (`toJobDto`).
- Строгая валидация query (`whitelist` + `forbidNonWhitelisted`).
- Web: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP в режиме Report-Only, без `X-Powered-By`.
- Демо-сид отказывается работать при `NODE_ENV=production` без явного `ALLOW_DEMO_SEED=true`.
- Секретов в репозитории нет; `.env` в `.gitignore`.

Денежных операций, авторизации и write-эндпоинтов на этом этапе нет.
