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
   - `BASIC_AUTH_USER` и `BASIC_AUTH_HASH` — логин и хеш пароля тестировщиков (их вводят на
     странице `/gate` «Вход для тестировщиков»):
     ```bash
     docker run --rm caddy:2-alpine caddy hash-password --plaintext 'пароль-для-тестеров'
     ```
     значение вставить **в одинарных кавычках**: `BASIC_AUTH_HASH='$2a$14$...'`.
5. **Запуск**:
   ```bash
   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml up -d --build
   ```
   Caddy сам получит сертификат. Сайт: `https://ваш-домен`. Главная открывается без пароля,
   при входе в приложение браузер спросит логин и пароль.

### Обновление

**Автоматически (рекомендуется).** Один раз на сервере:

```bash
cd /opt/agregator
git pull
sudo bash deploy/autodeploy/install.sh
```

Таймер systemd каждые 2 минуты запускает `deploy/autodeploy/deploy.sh`:

1. Есть новый коммит в `main`, ещё не развёрнутый и не помеченный неудачным.
2. CI по этому точному коммиту зелёный **строго**: workflow `.github/workflows/ci.yml` завершён
   успешно, и каждая обязательная задача («Lint, typecheck, test, build», «Docker stack
   (compose)», «Docker stack behind Caddy (proxy)») — success. Пропущенная, отменённая или
   отсутствующая задача — не зелёная. Пока CI идёт или GitHub не ответил (429, 403, таймаут),
   сервер ждёт и ничего не трогает.
3. Переход на коммит (только fast-forward), проверка места на диске (не меньше 5 ГБ, иначе
   сначала чистится кеш сборки), **сначала сборка образов** с тегом коммита (`agregator-api:<sha>`;
   прежние контейнеры в это время работают). Если в обновлении новая миграция базы —
   **резервная копия перед переключением** (без копии переключения нет). Потом переключение и,
   если менялся `deploy/Caddyfile`, рестарт Caddy.
4. **Проверка здоровья**: контейнеры `db`, `api`, `web`, `caddy` запущены и healthy (у API —
   `/health/ready` с запросом к базе); через Caddy по HTTPS главная 200, `/jobs` без пропуска 401,
   статика `/_next/static` и кадры `/landing` 200. Только после этого коммит записывается как
   развёрнутый; образы трёх последних версий остаются для отката, старше — удаляются.

Сбой сборки, переключения, рестарта Caddy или проверки повторяется при следующих запусках, до трёх
попыток (временные сбои сети apt/npm, медленный старт). После третьей и при красном CI коммит
помечается неудачным и не повторяется, владелец получает уведомление (если настроено, раздел
«Уведомления и обслуживание»), `agregator-deploy.service` завершается с ошибкой. Следующий коммит в
`main` пробуется заново. Сценарии проверяет `scripts/autodeploy-test.sh` в CI.

```bash
journalctl -u agregator-deploy -n 50 --no-pager      # что делало автообновление
sudo systemctl start agregator-deploy.service        # проверить main прямо сейчас
sudo systemctl disable --now agregator-deploy.timer  # выключить
cat /var/lib/agregator-deploy/deployed               # какой коммит развёрнут
sudo rm /var/lib/agregator-deploy/failed             # повторить коммит, помеченный неудачным
```

Важно: всё, что попадает в `main`, автоматически выполняется на сервере (сборка образов от root).
Поэтому в `main` — только через PR с зелёным CI; см. `docs/SECURITY.md`, раздел 9.

### Если обновление не прошло

Сначала смотрим причину, ничего не меняя:

```bash
journalctl -u agregator-deploy -n 80 --no-pager | grep agregator-deploy
sudo bash deploy/autodeploy/inventory.sh > report.txt   # отчёт только для чтения, без секретов
```

| Причина в журнале                     | Что делать                                                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `сборка образов не удалась`           | Сайт работает на прежних контейнерах. Исправление — новым коммитом в `main`, сервер подхватит его сам.                                                                      |
| `переключение контейнеров не удалось` | Часть контейнеров могла обновиться. `docker compose ... ps`, `docker compose ... logs --tail 100 web api`. Чаще всего помогает повтор (ниже); иначе — исправление в `main`. |
| `перезапуск Caddy не удался`          | `docker compose ... logs --tail 50 caddy` (ошибка в Caddyfile?). Исправление в `main` или повтор.                                                                           |
| `проверка после обновления: ...`      | Смотреть, что именно не отвечает: главная (web, Caddy), `/jobs` не 401 (правила Caddy!), статика или кадры.                                                                 |
| `fast-forward невозможен`             | На сервере есть локальные изменения: `git status`, `git log origin/main..HEAD`. Не удалять без разбора.                                                                     |

Повторить тот же коммит после исправления на сервере:

```bash
sudo rm /var/lib/agregator-deploy/failed
sudo systemctl start agregator-deploy.service
journalctl -u agregator-deploy -n 30 --no-pager
```

**Быстрый откат на предыдущую версию** (без сборки, около минуты; образы прошлых версий хранятся
на сервере):

```bash
sudo bash deploy/autodeploy/rollback.sh          # предыдущая развёрнутая версия
sudo bash deploy/autodeploy/rollback.sh <sha>    # конкретная версия из последних трёх
```

Откатываемый коммит помечается неудачным, автообновление его не вернёт; исправление — новым
коммитом в `main` (или `git revert` через PR).

Перед откатом `rollback.sh` проверяет и отказывается, ничего не меняя, если: в рабочей копии
есть незакоммиченные изменения; нет сохранённого SHA развёрнутой версии
(`/var/lib/agregator-deploy/deployed`); Docker не отвечает; между целевой и текущей версией
есть миграция, с которой прежний код не работает (`deploy/autodeploy/migration-check.sh`:
удаление или переименование таблиц и столбцов, смена типа, `SET NOT NULL`, новое значение
enum, обязательный столбец без умолчания). Причина и порядок действий печатаются. Для
несовместимой миграции: восстановить базу из копии до неё (решение владельца), затем
`ROLLBACK_SCHEMA_RESTORED=yes bash deploy/autodeploy/rollback.sh <sha>`. Миграция, которую
проверка ошибочно считает опасной, помечается строкой `-- rollback-safe: <причина>`; CI
проверяет новые миграции PR тем же скриптом. **Миграции базы назад автоматически не
откатываются**: старая версия должна работать с новой схемой (правило ниже); если не может —
восстановление из резервной копии по отдельному решению (раздел «Резервные копии»).

**Правило совместимых миграций.** Миграция применяется до переключения, и несколько секунд старая
версия API работает с новой схемой; откат тоже оставляет новую схему. Поэтому миграция только
добавляет: новые таблицы, столбцы с умолчанием или NULL, индексы. Удаление и переименование
столбцов и таблиц, `SET NOT NULL` на заполненных данных — в два шага: сначала код перестаёт ими
пользоваться (один релиз), затем миграция удаляет (следующий релиз).

**Упавшая миграция** (в журнале `migrate` ошибка `P3009` или `P3018`): следующие обновления не
пройдут, пока она отмечена. Разбор: `docker compose ... logs migrate`; если миграция не применилась
и исправлена новым коммитом — `docker compose -f deploy/docker-compose.yml run --rm migrate
./node_modules/.bin/prisma migrate resolve --rolled-back <имя_миграции>`, затем обычное обновление.
Если применилась частично — восстановление из копии перед миграцией (`*-pre-migration.dump`).

**Вручную:**

```bash
git pull
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml up -d --build
# если менялся deploy/Caddyfile:
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml restart caddy
```

Миграции базы применяются автоматически контейнером `migrate` перед запуском API.

### Если сборка зависает на `apt-get` (`deb.debian.org ... Connection timed out`)

С некоторых российских VPS контейнеры сборки не достают `deb.debian.org`, хотя сам сервер его
открывает. Тогда укажите в `deploy/.env` зеркало Debian (`DEBIAN_MIRROR`):

- только **доверенное** зеркало, в котором есть и `/debian`, и `/debian-security` (например,
  `http://mirror.yandex.ru`);
- только `http://`: так устроены штатные источники образа (сертификатов для https в нём на
  этом шаге ещё нет). Подлинность пакетов apt проверяет по подписям Debian, но содержимое
  запросов по http не шифруется;
- допустимы только символы `A-Z a-z 0-9 . : / _ ~ -`, без логина и пароля в адресе; иначе сборка
  остановится с ошибкой `DEBIAN_MIRROR: ...`.

Задать или заменить значение (команда не создаёт дубликатов) и проверить:

```bash
cd /opt/agregator
grep -q '^DEBIAN_MIRROR=' deploy/.env \
  && sed -i 's#^DEBIAN_MIRROR=.*#DEBIAN_MIRROR=http://mirror.yandex.ru#' deploy/.env \
  || echo 'DEBIAN_MIRROR=http://mirror.yandex.ru' >> deploy/.env
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml config | grep DEBIAN_MIRROR
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml up -d --build
```

Если раньше на сервере вручную правили `Dockerfile`, перед `git pull` посмотрите правки
(`git diff Dockerfile`) и, если там только замена зеркала, верните файл: `git checkout Dockerfile`
(команда удаляет все локальные изменения в этом файле).

### Если сертификат не выпускается (`NXDOMAIN` или `Timeout` в логах Caddy)

Let's Encrypt проверяет домен из интернета. Проверьте по порядку:

```bash
# 1. Домен виден в публичном DNS и указывает на этот сервер (A), лишних AAAA нет
dig +short A ваш-домен @8.8.8.8
dig +short AAAA ваш-домен @8.8.8.8
# 2. Домен делегирован на нужные DNS-серверы регистратора
dig +short NS ваш-домен @8.8.8.8
# 3. Caddy слушает 80 и 443, порты открыты в файрволе сервера и в панели провайдера
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml ps caddy
ufw status
```

- `NXDOMAIN` и пустой ответ на шаге 1: домен ещё не опубликован (новый домен .рф — до суток)
  **или** неверно указаны DNS-серверы, не создана зона, нет A-записи. Проверьте это у регистратора.
- AAAA-запись на чужой IPv6 мешает проверке: удалите её или направьте на сервер.
- Кириллический домен указывайте в punycode (`xn--...`) и в `DOMAIN`, и в `PUBLIC_ORIGIN`.

Когда шаг 1 возвращает IP сервера, ускорьте повторную попытку:

```bash
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml restart caddy
```

### Полезные команды

```bash
# состояние и логи
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml ps
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml logs -f web api

# резервная копия базы прямо сейчас и проверка восстановления (раздел «Резервные копии»)
sudo bash deploy/backup/backup.sh manual
sudo bash deploy/backup/restore-check.sh
```

### Резервные копии

Таймеры из `install.sh`: **каждый день в 03:17** — копия базы (`deploy/backup/backup.sh`), **по
воскресеньям в 04:17** — проверка восстановления (`deploy/backup/restore-check.sh`): последняя копия
разворачивается во временный контейнер без сети, сверяются миграции и таблицы, в журнал пишется
время восстановления. Плюс копия перед каждой новой миграцией (автообновление).

- Копии лежат в `/var/backups/agregator` (вне репозитория, права 600; в Docker-образ не попадают),
  хранятся 14 дней (`BACKUP_KEEP_DAYS`).
- **Копия вне сервера** (обязательна до реальных пользователей): `BACKUP_RCLONE_REMOTE` и
  `BACKUP_AGE_RECIPIENT` в `deploy/.env`. Копия шифруется публичным ключом `age` (приватный ключ —
  только офлайн у владельца) и выгружается `rclone` в хранилище другого провайдера с
  версионированием; ключ хранилища — только на запись, без удаления. Установка:
  `sudo apt install age rclone`, `age-keygen -o key.txt` на своём компьютере (в `deploy/.env` —
  строка `public key`), `sudo rclone config` (S3-совместимое хранилище).
- Без `BACKUP_RCLONE_REMOTE` копии только на сервере: при потере сервера они потеряются вместе с
  ним. Такая копия записывается как `mode=local-only` в `/var/lib/agregator-deploy/backup-status`,
  почасовая проверка шлёт об этом напоминание. С `BACKUP_REQUIRE_OFFSITE=true` (обязательно до
  публичного запуска) копия без выгрузки — сбой службы и уведомление.
- После выгрузки размер файла в хранилище сверяется с локальным (`rclone lsjson`); совпал —
  `mode=offsite-verified`. Не совпал или хранилище недоступно — сбой, локальная копия остаётся.
- Права ключа хранилища: запись и просмотр списка, без удаления и без чтения (`rclone copy
--immutable` не перезаписывает файлы). Версионирование и срок хранения — на стороне
  хранилища. Читать копии (восстановление) — отдельным ключом, который хранится у владельца.
- Проверка восстановления пишет `/var/lib/agregator-deploy/restore-status` (`result=ok|failed`);
  почасовая проверка сообщает, если её не было больше 8 дней или она не прошла.
- Восстановление в рабочую базу — только по решению владельца: остановить api и web,
  `pg_restore --clean` из нужной копии, запустить. Порядок и проверку отрабатывать на копии
  (`restore-check.sh <файл>`), а не на рабочей базе.

Предлагаемые цели (согласовать с владельцем): закрытый тест — потеря данных не больше 24 ч
(RPO), восстановление за 4 ч (RTO); публичный запуск — ≤1 ч и ≤2 ч (ежечасные копии или архив
WAL); откат кода — ≤15 мин (`rollback.sh`).

### Уведомления и обслуживание

- **Уведомления**: `NOTIFY_TELEGRAM_TOKEN` и `NOTIFY_TELEGRAM_CHAT` (бот Telegram) и/или
  `NOTIFY_WEBHOOK_URL` в `deploy/.env`. Приходят: обновление не прошло (после трёх попыток),
  красный CI, сбой копии или проверки восстановления, сбой любой службы `agregator-*`
  (`OnFailure`), проблемы из почасовой проверки. Проверить: `sudo bash
deploy/autodeploy/notify.sh "проверка"`.
- **Почасовая проверка** (`deploy/autodeploy/monitor.sh`): диск заполнен на 80% и больше,
  сертификат HTTPS истекает меньше чем через 14 дней, время не синхронизировано, главная не
  отвечает 200, последней копии больше 26 ч (`BACKUP_MAX_AGE_HOURS`) или она только на
  сервере, проверки восстановления не было 8 дней или она не прошла, каналы уведомлений не
  настроены или последняя отправка не дошла (`/var/lib/agregator-deploy/notify-status`). Об
  одной проблеме — не чаще раза в сутки.
- **Если не дошло само уведомление** (неверный токен, вебхук недоступен): `notify.sh`
  возвращает ошибку, в журнале службы видна причина, а почасовая проверка отправляет на
  внешний монитор `/fail` — тревогу поднимет монитор, а не бот.
- **Внешний монитор** (UptimeRobot, healthchecks.io) нужен отдельно: если лёг сам сервер, он
  ничего не отправит. Heartbeat-адреса: `DEPLOY_HEARTBEAT_URL`, `BACKUP_HEARTBEAT_URL`,
  `RESTORE_HEARTBEAT_URL` и главный — `MONITOR_HEARTBEAT_URL`: почасовая проверка пингует его,
  если всё в порядке, и `<адрес>/fail`, если есть проблемы. В мониторе — период 1 ч, допуск
  1 ч: нет пинга 2 часа — сервер или таймер не работают.
- **Логи контейнеров** ограничены (по 5 файлов × 10 МБ на сервис); кеш сборки старше трёх суток
  чистится после каждого обновления.

### Вход через банк (Сбер ID, Т-Банк ID)

Кнопки «Войти по Сбер ID» и «Войти с Т-Банком» на страницах входа и регистрации появляются, только
когда на сервере заданы ключи банка. Без ключей их нет, остальное работает как раньше.

**Сбер ID** (бесплатно, модерация около суток, нужна организация или ИП):

1. Зарегистрировать компанию на [developers.sber.ru](https://developers.sber.ru/portal/products/sber-id),
   подписать оферту через ЭДО.
2. Указать адрес возврата **в punycode**: `https://xn--80aah6bno9a5a.xn--p1ai/auth/sber/callback`
   (это `https://гарантыч.рф/auth/sber/callback`), без параметров. Данные: `openid name email mobile`.
3. Получить client_id, client_secret и сертификат клиента `.p12` с паролем (действует 12 месяцев:
   поставить напоминание о замене). Скачать корневой сертификат УЦ Минцифры (PEM): им подписан
   oauth.sber.ru.
4. На сервере положить файлы в `deploy/secrets` (папка не коммитится) и закрыть доступ:
   ```bash
   sudo install -d -m 700 /opt/agregator/deploy/secrets
   sudo install -m 600 sber-id.p12 russian_trusted_root_ca.pem /opt/agregator/deploy/secrets/
   ```
5. В `deploy/.env` (образец — `.env.example`, раздел «Вход через банк»): `BANK_LOGIN=true`,
   `SBER_ID_CLIENT_ID`, `SBER_ID_CLIENT_SECRET`, `SBER_ID_CERT_PATH`, `SBER_ID_CERT_PASSWORD`,
   `SBER_ID_CA_PATH`. `PUBLIC_ORIGIN` должен совпадать с доменом сайта.

**Т-Банк ID**: письмо на tid@tbank.ru (компания, сайт, число входов в месяц). По открытым данным
банк подключает от 30 000 входов в месяц, по договору и с расчётным счётом в Т-Бизнесе. Адрес
возврата: `https://xn--80aah6bno9a5a.xn--p1ai/auth/tbank/callback`. Ключи — в `TBANK_ID_CLIENT_ID`
и `TBANK_ID_CLIENT_SECRET`, сертификат не нужен.

После правки `deploy/.env` применить: `sudo systemctl start agregator-deploy` подхватит только
новый коммит, поэтому вручную:

```bash
cd /opt/agregator
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml \
  -f deploy/docker-compose.bank-login.yml up -d api
curl -s --resolve "$DOMAIN:443:127.0.0.1" https://$DOMAIN/login | grep -c 'Сбер ID'
```

С `BANK_LOGIN=true` API получает выход в интернет (сеть `bank-egress`) и видит `deploy/secrets`
только для чтения; без него API в интернет не ходит. Ошибка в настройке (нет сертификата, пустой
секрет, http вместо https) не даёт API запуститься: смотреть `docker compose ... logs api`.

## Закреплённые образы и действия CI

Образы (`node`, `postgres`, `caddy`) и действия GitHub (`actions/*`, `pnpm/action-setup`)
указаны по неизменяемому адресу: образ по digest (`postgres:16-alpine@sha256:…`), действие по
коммиту (`actions/checkout@<sha> # v4.4.0`). Подмена тега у издателя не попадёт на сервер и
в CI незаметно (AUDIT_FINDINGS SEC-6, DEV-14).

Обновлять раз в месяц и при уязвимости в образе: получить digest нового тега (`docker buildx
imagetools inspect postgres:16-alpine`, строка `Digest`), коммит тега действия (`git ls-remote
https://github.com/actions/checkout 'refs/tags/v4.4.0^{}'`), заменить во всех файлах
(`git grep -n '@sha256\|uses: '`), пройти CI. Новая мажорная версия Postgres — отдельная
миграция данных, не замена digest.

## Перед появлением реальных пользовательских данных

Сейчас стенд для закрытого теста. До реальных пользователей обязательно:

- копия **вне сервера** (`BACKUP_RCLONE_REMOTE`, раздел «Резервные копии»; ежедневные копии и
  еженедельная проверка восстановления уже на таймерах);
- уведомления (`NOTIFY_*`) и внешний монитор доступности;
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
- Без пароля открыта только главная (статичный лендинг) и её статические файлы. Всё приложение
  (каталог, вход, кабинет) доступно только тестировщикам: без пропуска браузер уводит на
  страницу `/gate` в стиле сайта, пока не выполнены условия публичного запуска из
  `docs/SECURITY.md` (раздел 8: что именно открыто и почему). Для полного открытия убрать
  matcher `@private` и блок `forward_auth` в `deploy/Caddyfile`. После смены пароля
  тестировщиков все выданные пропуска перестают действовать.
- Стек проверяется в CI двумя job: `Docker stack (compose)` (сборка образов, smoke и
  интеграционные тесты по контейнерам, попытка подмены IP из внутренней сети) и
  `Docker stack behind Caddy (proxy)` (Caddy на `https://localhost` со своим сертификатом:
  приложение без пропуска 401 или переход на `/gate`, с пропуском 200, главная и её статика без пароля 200, попытки обхода
  через `..` не открывают приложение, HSTS, редирект с http, порты 3000 и 4000 на хосте закрыты).
  Поведение главной в браузере (service worker, вход тестировщика, офлайн-страница) проверяет
  `scripts/landing-e2e.mjs` в job `Lint, typecheck, test, build` за этим же Caddyfile.
  Получение настоящего сертификата Let's Encrypt проверяется только при запуске на домене.
