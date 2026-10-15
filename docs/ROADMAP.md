# Дорожная карта Agregator Remont

## Стек
- Monorepo: pnpm workspaces
- Web/PWA: Next.js App Router, TypeScript, Tailwind CSS
- API: NestJS, TypeScript, Prisma, PostgreSQL
- Тесты: Vitest для web и Jest + Supertest для API
- Инфраструктура локально: Docker Compose PostgreSQL
- CI: GitHub Actions (lint, typecheck, tests, build)
- Деньги не храним сами; безопасная сделка — только через одобренного платёжного провайдера.

## Организация работы
- Claude Code: владелец apps/web, packages/ui и UI-документации
- ChatGPT: владелец apps/api, packages/contracts, prisma/schema и backend-тестов
- Общие файлы (корневые package.json, lockfile, docker-compose, CI) — **сначала Claude**, ChatGPT не изменяет их без согласования.
- Работать в отдельных ветках, изменения в main — только через PR.
- Контракт API согласовать до интеграции web и API.
- Никаких секретов в Git; .env.example с плейсхолдерами.

## Фаза 0: bootstrap (1–2 недели)
Claude:
1. Создать workspace (pnpm) и web Next.js.
2. Docker Compose PostgreSQL; настройки root scripts, eslint/prettier, basic CI.
3. Главная страница, каталог, карточка задания, роли (пока UI без авторизации).
4. Типизированный API клиент с mock/dev fallback; готовность подключить backend.

ChatGPT:
1. Предложить и зафиксировать контракты GET /health, GET /v1/jobs, GET /v1/jobs/:id.
2. Сформировать NestJS модуль jobs с DTO, pagination, валидацией, обработкой ошибок.
3. Prisma models User, ContractorProfile, Job, Bid, Deal (без платежей).
4. Интеграционные тесты API и ограничение публичных данных.

Критерий готовности: web и api стартуют локально, каталог получает данные из API, CI зелёный.

## Фаза 1: каталог и тендеры (2–4 недели)
Claude: страницы регистрации, создания задания, кабинет заказчика, профиль подрядчика, адаптив.
ChatGPT: регистрация, авторизация, RBAC, задачи/отклики, миграции, тесты прав доступа.
Критерий: заказчик создаёт задачу, подрядчик откликается, чужие данные недоступны.

## Фаза 2: сделки и сообщения (3–5 недель)
Claude: UI переписки, этапов и фототчётов, админка.
ChatGPT: server-side state machine, web socket/notifications, object storage, audit logs.
Критерий: базовый lifecycle без перевода денег, сохранение доказательств, модерация.

## Фаза 3: безопасная сделка (срок зависит от банка)
Обе стороны: sandbox, выбор провайдера, подтверждение сценария; idempotency, webhook signatures, reconciliation, refunds.
Финансовый запуск заблокирован до отдельного ревью, юридического подтверждения и тестов отказов.

## Правила качества
- Любые create/update endpoints только после auth и authorization.
- Все пользовательские вводы валидируются.
- Не размещать реальные персональные данные, токены, ключи в тестах.
- PR небольшие, с тестами и инструкцией локального запуска.
- Не считать AI-ревью независимым security-аудитом.

## Первый спринт
Claude начинает с bootstrap/web. ChatGPT делает API после закрепления структуры monorepo.
