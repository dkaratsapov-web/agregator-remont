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
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml up -d --build
```

Первая сборка занимает несколько минут. Затем откройте http://localhost:3000 в Chrome или Firefox.
В каталоге будут демо-заказы; зарегистрируйтесь как заказчик, чтобы создать свой заказ.

Остановить: `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.local.yml down` (данные сохранятся в томе `db-data`;
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

### Если сборка зависает на `apt-get` (`deb.debian.org ... Connection timed out`)

С некоторых российских VPS контейнеры сборки не достают `deb.debian.org`, хотя сам сервер его
открывает. Укажите зеркало Debian в `deploy/.env` и повторите сборку:

```bash
echo 'DEBIAN_MIRROR=http://mirror.yandex.ru' >> deploy/.env
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml up -d --build
```

Если раньше на сервере вручную правили `Dockerfile`, перед `git pull` верните его:
`git checkout Dockerfile`.

### Если сертификат не выпускается (`NXDOMAIN` в логах Caddy)

Домен ещё не виден в DNS (новый домен .рф публикуется до суток). Проверка:
`dig +short A ваш-домен @8.8.8.8` — должен вернуться IP сервера. Для кириллического домена
указывайте его в punycode (`xn--...`) и в `DOMAIN`, и в `PUBLIC_ORIGIN`. Когда IP появился,
ускорьте повторную попытку: `docker compose ... restart caddy`.

### Полезные команды

```bash
# состояние и логи
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml ps
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml logs -f web api

# резервная копия базы (храните копии вне сервера)
docker compose -f deploy/docker-compose.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > backup-$(date +%F).dump

# проверка восстановления: копия разворачивается в отдельную временную базу
docker compose -f deploy/docker-compose.yml exec -T db sh -c 'createdb -U "$POSTGRES_USER" restore_check'
docker compose -f deploy/docker-compose.yml exec -T db \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d restore_check --no-owner' < backup-$(date +%F).dump
docker compose -f deploy/docker-compose.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d restore_check -c "select count(*) from jobs"'
docker compose -f deploy/docker-compose.yml exec -T db sh -c 'dropdb -U "$POSTGRES_USER" restore_check'
```

## Перед появлением реальных пользовательских данных

Сейчас стенд для закрытого теста. До реальных пользователей обязательно:

- резервное копирование по расписанию (cron) с копией **вне сервера** и регулярной проверкой
  восстановления (команды выше);
- мониторинг доступности и срока действия сертификата (Caddy продлевает его сам, но сбой
  продления нужно увидеть заранее);
- ограничение размера логов Docker (`/etc/docker/daemon.json`: `"log-opts": {"max-size": "10m", "max-file": "5"}`);
- условия публичного запуска из [docs/SECURITY.md](../docs/SECURITY.md).

## Что внутри и почему так

- На сервере наружу открыт только Caddy (80/443). Порт web на хосте не публикуется
  (`docker-compose.local.yml` делает это только для локального запуска), поэтому пароль Caddy
  нельзя обойти даже с самого сервера через `127.0.0.1`. CI проверяет это и конфигурацией
  (`scripts/check-deploy-ports.mjs`), и на запущенном стеке.
- База, миграции и API находятся во внутренней сети `backend` без выхода наружу. У web в ней
  статический адрес (`WEB_BACKEND_IP`, по умолчанию `172.31.250.10`), и API доверяет
  `X-Forwarded-For` только ему. CI проверяет: посторонний контейнер в этой сети с подменённым
  заголовком упирается в лимит на вход. Если подсеть `172.31.250.0/24` занята на сервере,
  задайте `BACKEND_SUBNET` и `WEB_BACKEND_IP` в `deploy/.env`.
- Caddy записывает в `X-Forwarded-For` реальный IP посетителя (заголовок от клиента не принимается),
  web берёт его при `WEB_TRUST_PROXY_HOPS=1` и передаёт API. Так работают лимиты на вход по IP
  посетителя.
- `PUBLIC_ORIGIN` попадает в `WEB_PUBLIC_ORIGIN`: формы принимаются только с этого адреса.
- Сайт закрыт паролем (basic auth), пока не выполнены условия публичного запуска из
  `docs/SECURITY.md`. Для открытия убрать блок `basic_auth` в `deploy/Caddyfile`.
- Стек проверяется в CI двумя job: `Docker stack (compose)` (сборка образов, smoke и
  интеграционные тесты по контейнерам, попытка подмены IP из внутренней сети) и
  `Docker stack behind Caddy (proxy)` (Caddy на `https://localhost` со своим сертификатом:
  без пароля 401, с паролем 200, HSTS, редирект с http, порты 3000 и 4000 на хосте закрыты).
  Получение настоящего сертификата Let's Encrypt проверяется только при запуске на домене.
