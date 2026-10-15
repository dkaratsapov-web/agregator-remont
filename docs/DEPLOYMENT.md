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
| `API_URL` | web | внутренний адрес API, например `http://api:4000` |
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
