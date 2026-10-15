# Старт Claude Code: единственный разработчик

Проект: https://github.com/dkaratsapov-web/agregator-remont

## Роли
- Claude Code: **весь код**, включая frontend, backend, БД, тесты, CI/CD, документацию, деплой.
- ChatGPT: **независимый ревьюер**, архитектура и риски, без изменения кода.
- Владелец: продуктовые решения, приёмка и разрешение объединять PR.

## Старт
Изучи docs/ROADMAP.md и docs/PROJECT.md в ветке feat/marketplace-foundation, PR #1. Сначала пользователь должен объединить PR #1 с main либо ты создаёшь рабочую ветку от feat/marketplace-foundation. Не затрагивай main напрямую.

## Первый PR — работающий MVP-фундамент
1. pnpm monorepo, apps/web Next.js App Router + TS + Tailwind + PWA, apps/api NestJS, Prisma/PostgreSQL, docker-compose, .env.example, .gitignore.
2. Русскоязычные адаптивные страницы: главная, каталог заказов, подробная карточка заказа.
3. Модель Job (id, title, description, category, city, budgetMin, budgetMax, currency RUB, status, createdAt) и demo seed.
4. GET /health -> {status:"ok"}; GET /v1/jobs?page=1&limit=12 -> {items, page, limit, total}; GET /v1/jobs/:id -> детальная карточка, корректный 404. Query validation и ограничение limit.
5. Web получает данные через настоящий API. Dev mocks допустимы только явно помеченные и не в production.
6. README с точными командами запуска, CI lint/typecheck/test/build, тесты health/jobs, работающая локальная сборка.
7. Создай PR (не мержи), перечисли готовые функции и **фактически выполненные** проверки.

## Безопасность
- Не внедрять настоящие деньги, escrow или псевдозащиту без отдельного этапа.
- Не коммитить секреты и персональные данные.
- Проверять права доступа для будущих write-endpoints на сервере.
- Не утверждать о безопасности без подтверждения.
- После каждого PR дождись замечаний ChatGPT и исправь Critical/High перед согласованием.

**Начинай писать код, не трать следующий цикл на переписывание плана.**
