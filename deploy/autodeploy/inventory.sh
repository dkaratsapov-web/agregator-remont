#!/usr/bin/env bash
# Отчёт о состоянии сервера, только чтение: sudo bash deploy/autodeploy/inventory.sh > report.txt
#
# Ничего не меняет: не перезапускает контейнеры, не трогает git и базу. Не печатает deploy/.env,
# токены, хеши паролей, cookie, телефоны и IP посетителей: из журнала автообновления берутся только
# строки самого deploy.sh, из базы — только имена и время миграций. Отчёт можно переслать в чат
# или задачу на GitHub (перед отправкой его стоит просмотреть).
set -uo pipefail

REPO_DIR=${REPO_DIR:-/opt/agregator}
BRANCH=${BRANCH:-main}
GITHUB_API=${GITHUB_API:-https://api.github.com/repos/dkaratsapov-web/agregator-remont}
STATE_DIR=${STATE_DIR:-/var/lib/agregator-deploy}

section() { printf '\n== %s ==\n' "$1"; }
cd "$REPO_DIR" || { echo "Нет $REPO_DIR"; exit 1; }
compose=(docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml)

section 'Время и версия'
date -u '+%Y-%m-%d %H:%M:%S UTC'
local_sha=$(git rev-parse HEAD)
echo "рабочая копия:     $local_sha ($(git log -1 --format=%s HEAD))"
echo "развёрнуто:        $(cat "$STATE_DIR/deployed" 2> /dev/null || echo 'нет отметки')"
echo "помечен неудачным: $(cat "$STATE_DIR/failed" 2> /dev/null || echo 'нет')"
remote_sha=$(curl -fsS --max-time 15 -H 'Accept: application/vnd.github+json' \
  "$GITHUB_API/commits/$BRANCH" 2> /dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])' 2> /dev/null)
echo "GitHub $BRANCH:       ${remote_sha:-не удалось получить}"
if [ -n "${remote_sha:-}" ]; then
  [ "$remote_sha" = "$local_sha" ] && echo 'совпадает с GitHub' || echo 'ОТЛИЧАЕТСЯ от GitHub'
fi

section 'git status --short (локальные изменения на сервере)'
git status --short | sed 's/^/  /'
[ -z "$(git status --short)" ] && echo '  чисто'

section 'Контейнеры'
"${compose[@]}" ps --format 'table {{.Service}}\t{{.State}}\t{{.Health}}\t{{.Status}}' 2>&1

section 'Образы контейнеров'
for id in $("${compose[@]}" ps -q 2> /dev/null); do
  docker inspect --format '{{.Name}}  {{.Config.Image}}  {{.Image}}  создан {{.Created}}' "$id"
done

section 'Таймер автообновления'
systemctl status agregator-deploy.timer --no-pager 2>&1 | head -n 6
systemctl is-failed agregator-deploy.service > /dev/null 2>&1 &&
  echo 'последний запуск agregator-deploy.service: FAILED' ||
  echo 'последний запуск agregator-deploy.service: без ошибки'

section 'Журнал автообновления (последние 40 строк deploy.sh)'
journalctl -u agregator-deploy.service -n 400 --no-pager -o cat 2> /dev/null |
  grep '^\[agregator-deploy\]' | tail -n 40

section 'Домен, DNS, HTTPS и ответы маршрутов'
domain=$(sed -n 's/^DOMAIN=//p' deploy/.env 2> /dev/null | tr -d "\"'" | tail -n 1)
if [ -z "$domain" ]; then
  echo 'DOMAIN в deploy/.env не задан'
else
  echo "домен: $domain"
  echo "DNS (A): $(getent ahostsv4 "$domain" 2> /dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  echo "IP сервера: $(hostname -I 2> /dev/null | awk '{print $1}')"
  expiry=$(echo | timeout 10 openssl s_client -connect "$domain:443" -servername "$domain" 2> /dev/null |
    openssl x509 -noout -enddate 2> /dev/null | cut -d= -f2)
  echo "сертификат действует до: ${expiry:-не удалось проверить}"
  for path in / /gate /offline /jobs /login /account /_next/image; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$domain$path")
    printf '  %-14s %s\n' "$path" "$code"
  done
  echo '  (ожидается: / /gate /offline — 200; остальное без пропуска тестировщика — 401)'
  echo "  http -> https: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$domain/")"
fi

section 'Миграции базы (Prisma)'
# shellcheck disable=SC2016 # переменные раскрываются внутри контейнера db
"${compose[@]}" exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "select migration_name, finished_at, rolled_back_at from _prisma_migrations order by started_at"' 2>&1 |
  tail -n 30

section 'Диск'
df -h / | tail -n 1
docker system df 2> /dev/null | head -n 5
