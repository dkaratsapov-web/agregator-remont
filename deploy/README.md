# Развёртывание через Docker Compose

Стек: PostgreSQL 16, одноразовый контейнер миграций (+ демо-заказы), API (NestJS), web (Next.js)
и на сервере с доменом — Caddy с автоматическим HTTPS (Let's Encrypt) и паролем на весь сайт.

Требования к сервисам, переменные и схема доверия к proxy: [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).
Ограничения публичного запуска: [docs/SECURITY.md](../docs/SECURITY.md) (пока только закрытый тест).

## 1. Локально (посмотреть продукт на своём компьютере)

Нужен Docker Desktop (Windows/macOS) или Docker Engine (Linux).

```bash
git clone https://github.com/dkaratsapov-web/agregator-remont.git
cd agregator-remont
cp deploy/.env.example deploy/.env
# откройте deploy/.env и задайте POSTGRES_PASSWORD (буквы и цифры), например: openssl rand -hex 24
docker compose -f deploy/docker-compose.yml up -d --build
```

Первая сборка занимает несколько минут. Затем откройте http://localhost:3000 в Chrome или Firefox.
В каталоге будут демо-заказы; зарегистрируйтесь как заказчик, чтобы создать свой заказ.

Остановить: `docker compose -f deploy/docker-compose.yml down` (данные сохранятся в томе `db-data`;
`down -v` удалит и их).

## 2. На сервере с доменом (закрытый тест)

Подойдёт VPS с Ubuntu 22.04/24.04, 2 ГБ RAM (Timeweb, Selectel, Yandex Cloud и т.п.).

1. **DNS**: A-запись домена (и при желании `www`) на IP сервера. Дождитесь, пока она начнёт
   резолвиться: `dig +short remont.example.ru`.
2. **Порты**: открыть 80 и 443 (TCP) и 443 (UDP); всё остальное закрыть.
3. **Docker** на сервере: https://docs.docker.com/engine/install/ubuntu/
4. **Код и настройки**:
   ```bash
   git clone https://github.com/dkaratsapov-web/agregator-remont.git
   cd agregator-remont
   cp deploy/.env.example deploy/.env
   ```
   В `deploy/.env`:
   - `POSTGRES_PASSWORD` — `openssl rand -hex 24`;
   - `DOMAIN=ваш-домен`, `PUBLIC_ORIGIN=https://ваш-домен`, `WEB_TRUST_PROXY_HOPS=1`;
   - `BASIC_AUTH_USER` и `BASIC_AUTH_HASH` (хеш пароля для входа на сайт):
     ```bash
     docker run --rm caddy:2-alpine caddy hash-password --plaintext 'пароль-для-тестеров'
     ```
     значение вставить **в одинарных кавычках**: `BASIC_AUTH_HASH='$2a$14$...'`.
5. **Запуск**:
   ```bash
   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml up -d --build
   ```
   Caddy сам получит сертификат. Сайт: `https://ваш-домен` (браузер спросит логин и пароль).

### Обновление

```bash
git pull
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml up -d --build
```

Миграции базы применяются автоматически контейнером `migrate` перед запуском API.

### Полезные команды

```bash
# состояние и логи
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml ps
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml logs -f web api

# резервная копия базы (храните копии вне сервера)
docker compose -f deploy/docker-compose.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > backup-$(date +%F).dump
```

## Что внутри и почему так

- API наружу не публикуется: web обращается к нему по внутренней сети Docker. CORS пуст.
- Caddy записывает в `X-Forwarded-For` реальный IP посетителя (заголовок от клиента не принимается),
  web берёт его при `WEB_TRUST_PROXY_HOPS=1`, API доверяет заголовку только из приватной сети
  Docker (`TRUST_PROXY=uniquelocal`). Так работают лимиты на вход по IP посетителя.
- `PUBLIC_ORIGIN` попадает в `WEB_PUBLIC_ORIGIN`: формы принимаются только с этого адреса.
- Сайт закрыт паролем (basic auth), пока не выполнены условия публичного запуска из
  `docs/SECURITY.md`. Для открытия убрать блок `basic_auth` в `deploy/Caddyfile`.
- Порт web `3000` привязан к `127.0.0.1` и снаружи недоступен.
- Сборка и запуск этого стека проверяются в CI (job `Docker stack (compose)`): образы собираются,
  стек поднимается, по нему проходят smoke и интеграционный тест заказов.
