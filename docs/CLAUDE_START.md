# Стартовое задание для Claude Code

Ты технический продюсер frontend/bootstrap в репозитории dkaratsapov-web/agregator-remont.

Цель первого PR: работающий базовый Web/PWA (Next.js App Router + TypeScript + Tailwind) и monorepo-каркас, готовый к подключению NestJS API.

## Ветка
Начни с актуальной main, создай **свою** ветку `feat/claude-web-bootstrap`. НЕ вноси изменения в `feat/marketplace-foundation` (там работает ChatGPT). Перед началом ознакомься с docs/ROADMAP.md после его слияния в main либо запроси разрешение у пользователя взять файл из существующего PR #1.

## Создай
- pnpm-workspace.yaml и корневой package.json (скрипты dev, lint, typecheck, test, build)
- apps/web — Next.js + Tailwind + адаптивные компоненты
- apps/web/app — главная, каталог заказов, детали заказа
- packages/ui — при необходимости, не усложняй
- apps/web/lib/api — типизированный клиент под GET /v1/jobs, GET /v1/jobs/:id
- apps/web/lib/mocks — явно обозначенный дев-режим, без имитации реальных сделок
- .env.example, .gitignore, docker-compose.yml (PostgreSQL), README.md с запуском
- GitHub Actions с lint/typecheck/build; lockfile обязательно фиксировать

## UX
Русский интерфейс. Визуально качественный адаптивный продукт, не шаблонный дешёвый лендинг.
Роли: заказчик и исполнитель. Категория только ремонт/строительство. Карточки с городом, бюджетом, категорией, заголовком, датой.
В dev-моке не использовать реальные персональные данные.

## API contract (предварительный)
GET /health -> {status:"ok"}
GET /v1/jobs?page=1&limit=12 -> {items:JobSummary[],page:number,limit:number,total:number}
GET /v1/jobs/:id -> JobDetail
JobSummary: {id:string,title:string,category:string,city:string,budgetMin:number|null,budgetMax:number|null,currency:"RUB",createdAt:string}
JobDetail расширяет JobSummary полями description:string, status:"OPEN"|"IN_PROGRESS"|"CLOSED".
Пока никакой клиентской записи, оплаты или авторизации-заглушки, выдающей себя за защищённую.

## Приёмка
- pnpm install, pnpm --filter web lint, pnpm --filter web build должны проходить
- В README точные команды запуска
- Каталог и карточка работают с моками; API-клиент готов к реальной интеграции
- Без изменения финансовой логики, без хранения секретов, без коммита .env
- Создай PR в main и дай пользователю ссылку, не мержи сам

## Обязательное правило параллельности
Не редактируй apps/api или packages/contracts — их делает ChatGPT. Если нужны изменения контракта, зафиксируй предложение в PR и дождись согласования.
