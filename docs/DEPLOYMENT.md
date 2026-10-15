# Развёртывание и эксплуатация (Фаза 0)

Публичного окружения пока нет. Здесь требования к нему и безопасные значения по умолчанию.

## Схема

```
Интернет → reverse proxy (TLS, HSTS) → web :3000 (Next.js, next start)
                                     ↘ api :4000 (NestJS)  ← web ходит в API с сервера по API_URL
                                         ↓
                                     PostgreSQL 16
```

- API можно не публиковать в интернет вообще: web обращается к нему с сервера. Если API
  публичный, он должен стоять за тем же proxy с TLS.
- Один инстанс API (ограничение rate limit, см. `docs/SECURITY.md`, раздел 2).

## Переменные окружения

| Переменная | Где | Production |
| --- | --- | --- |
| `NODE_ENV` | api, web | `production` |
| `DATABASE_URL` | api | обязательна; пользователь БД без прав суперпользователя |
| `API_PORT` | api | по умолчанию `4000` |
| `CORS_ORIGINS` | api | пусто, если браузеры не обращаются к API напрямую; иначе точные `https://` origin'ы |
| `TRUST_PROXY` | api | число доверенных прокси перед API (обычно `1`) или их адреса через запятую |
| `RATE_LIMIT_PER_MIN` | api | по умолчанию `120` |
| `AUTH_RATE_LIMIT_PER_MIN` | api | по умолчанию `10` (вход и регистрация) |
| `API_URL` | web | внутренний адрес API, например `http://api:4000` |
| `WEB_TRUST_PROXY_HOPS` | web | число reverse proxy перед web (обычно `1`); `0` = IP посетителя не передаётся в API |
| `ALLOW_DEMO_SEED` | api | не задавать (демо-сид в production отключён) |

Секреты передаются через окружение/секрет-хранилище платформы, не через файлы в репозитории.

## Reverse proxy

- TLS-терминация на proxy, редирект `http → https`, заголовок
  `Strict-Transport-Security: max-age=31536000; includeSubDomains` (выставляет proxy, т.к.
  приложения не знают, что их обслуживают по HTTPS).
- Proxy обязан **перезаписывать** `X-Forwarded-For` (не дописывать к клиентскому значению) или
  `TRUST_PROXY` должен точно соответствовать числу прокси. Иначе клиент подделает свой IP
  и обойдёт rate limit.
- `TRUST_PROXY=true` запрещён валидацией конфигурации.
- Если API не за proxy, `TRUST_PROXY` не задавать: тогда `X-Forwarded-For` игнорируется.

## IP посетителя и лимиты на вход

Цепочка: посетитель → proxy → web → API. Чтобы лимит на вход считался по посетителю, а не по
серверу web, и чтобы его нельзя было обойти подделкой заголовка:

1. Proxy перед web дописывает реальный адрес клиента в конец `X-Forwarded-For`
   (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`).
2. Web: `WEB_TRUST_PROXY_HOPS=1` (по числу proxy). Web берёт ровно этот адрес, игнорируя то,
   что прислал клиент, и передаёт его API.
3. API: `TRUST_PROXY` = адрес(а) сервера web (например, `10.0.0.5` или подсеть контейнеров).
   Заголовок принимается только от этих адресов, поэтому посторонний клиент подделать IP не сможет.
   API лучше вообще не публиковать в интернет: web обращается к нему по внутренней сети.

Без proxy перед web оставьте `WEB_TRUST_PROXY_HOPS=0`: подмена невозможна, но лимит на вход
станет общим для всех посетителей.

## Host, TLS и Server Actions

Формы входа, регистрации и выхода — Server Actions. Next.js и наша проверка сравнивают `Origin`
браузера с хостом запроса, поэтому proxy обязан передавать публичный хост:

- `Host` = публичное имя сайта **или** `X-Forwarded-Host` = публичное имя
  (nginx: `proxy_set_header Host $host;` либо `proxy_set_header X-Forwarded-Host $host;`).
- `X-Forwarded-Proto: https`; TLS терминируется на proxy, `http` → редирект на `https`.
- `serverActions.allowedOrigins` не задавать: дополнительные origin'ы ослабляют защиту от CSRF.
- Если сайт доступен по нескольким доменам, все, кроме основного, редиректить на основной:
  иначе формы на дополнительном домене будут отклоняться как чужой origin.

Симптом неверной настройки: формы отвечают «Запрос отклонён» или 500, в логе web —
предупреждение Next.js о несовпадении `origin` и `x-forwarded-host`.

## Healthchecks

- API: `GET /health` → `200 {"status":"ok"}` (liveness, без обращения к БД, не лимитируется).
  Готовность к трафику с проверкой БД (readiness) будет добавлена вместе с первым деплоем.
- Web: `GET /offline` → `200` (статическая страница, без обращения к API).

## Порядок выкладки

1. `pnpm install --frozen-lockfile && pnpm build`
2. `pnpm --filter @agregator/api exec prisma migrate deploy` (только `deploy`, никогда `migrate dev`)
3. Запуск: `node apps/api/dist/main.js`, `pnpm --filter @agregator/web start`
4. Smoke: `API_URL=… WEB_URL=… pnpm smoke`

Бэкапы PostgreSQL и проверка восстановления — обязательное условие перед появлением реальных
пользовательских данных (Фаза 4 в `docs/ROADMAP.md`).
