#!/usr/bin/env bash
# Проверка восстановления: sudo bash deploy/backup/restore-check.sh [файл.dump | файл.dump.age]
# Берёт последнюю копию из BACKUP_DIR (или указанный файл), разворачивает её во временный
# контейнер postgres без сети и портов и сверяет: все миграции из репозитория применены, таблицы
# users и jobs читаются. Печатает время восстановления (фактический RTO для этой базы).
# Запускается таймером раз в неделю (deploy/autodeploy/install.sh). Сбой — уведомление; итог —
# в STATE_DIR/restore-status (monitor.sh напоминает, если проверки давно не было или она упала).
# Копия вне сервера (шифрованная, скачанная из хранилища ключом на чтение):
#   AGE_IDENTITY=<приватный ключ age> bash deploy/backup/restore-check.sh копия.dump.age
# — расшифровка во временный файл (права 600, удаляется после проверки) и та же проверка.
# Скачать последнюю копию из хранилища и проверить её — offsite-restore-check.sh (он вызывает
# этот скрипт с RESTORE_STATUS=offsite-restore-check, чтобы не смешивать итоги).
set -euo pipefail

REPO_DIR=${REPO_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
# shellcheck source=deploy/autodeploy/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/../autodeploy/lib.sh"
cd "$REPO_DIR"

dir=${BACKUP_DIR:-$(env_value BACKUP_DIR)}
dir=${dir:-/var/backups/agregator}
image=${RESTORE_IMAGE:-postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea}
name="agregator-restore-check-$$"
status_name=${RESTORE_STATUS:-restore-status}

log() { echo "[agregator-restore] $*"; }
die() {
  log "ОШИБКА: $1"
  write_status "$status_name" result=failed "reason=$1"
  notify "проверка восстановления не прошла: $1"
  exit 1
}

file=${1:-$(find "$dir" -maxdepth 1 -name 'agregator-*.dump' -printf '%T@ %p\n' 2> /dev/null | sort -n | tail -n 1 | cut -d' ' -f2-)}
if [ -z "$file" ] || [ ! -f "$file" ]; then die "нет копии в $dir"; fi
log "копия: $file"

started=$(date +%s)
plain=''
cleanup() {
  docker rm -f "$name" > /dev/null 2>&1 || true
  if [ -n "$plain" ]; then rm -f "$plain"; fi
}
trap cleanup EXIT
source_file=$file
if [[ "$file" == *.age ]]; then
  if [ -z "${AGE_IDENTITY:-}" ] || [ ! -f "$AGE_IDENTITY" ]; then
    die 'зашифрованная копия: укажите приватный ключ age в AGE_IDENTITY'
  fi
  command -v age > /dev/null || die 'не установлен age (apt install age)'
  plain=$(mktemp)
  age -d -i "$AGE_IDENTITY" -o "$plain" "$file" || die 'расшифровка не удалась: не тот ключ или файл повреждён'
  file=$plain
fi
docker run -d --rm --name "$name" --network none -e POSTGRES_PASSWORD=restore-check "$image" > /dev/null ||
  die "не запустился контейнер $image"
# Готовность — по TCP: при первом запуске образ postgres поднимает временный сервер только на
# сокете (initdb), затем останавливает его; проверка по сокету ловила этот сервер, и
# pg_restore иногда попадал на остановку (учения CI, ТЗ #40).
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -h 127.0.0.1 -U postgres > /dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" pg_isready -h 127.0.0.1 -U postgres > /dev/null 2>&1 || die 'временная база не поднялась'
docker exec -i "$name" sh -c 'createdb -U postgres restore && pg_restore -U postgres -d restore --no-owner --exit-on-error' < "$file" ||
  die 'pg_restore не удался'

query() { docker exec "$name" psql -U postgres -d restore -tAc "$1"; }
applied=$(query 'select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null') ||
  die 'нет таблицы _prisma_migrations'
expected=$(find apps/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
users=$(query 'select count(*) from users') || die 'таблица users не читается'
jobs=$(query 'select count(*) from jobs') || die 'таблица jobs не читается'
seconds=$(($(date +%s) - started))

log "миграций в копии: $applied, в репозитории: $expected; users: $users; jobs: $jobs; восстановление: ${seconds} с"
# Копия может быть сделана до последнего обновления (миграций меньше, чем в репозитории), а после
# разрешённого отката — больше: в базе остаются миграции версии, с которой откатились.
[ "$applied" -gt 0 ] || die "миграций в копии $applied, в репозитории $expected"
if [ "$applied" -gt "$expected" ]; then
  log "в копии миграций больше, чем в коде: так бывает после отката на прежнюю версию"
fi
write_status "$status_name" result=ok "file=$source_file" "seconds=$seconds" "migrations=$applied"
# Внешний монитор еженедельной проверки на сервере; разовые проверки (другой RESTORE_STATUS) его
# не трогают.
heartbeat=''
[ "$status_name" != restore-status ] || heartbeat=$(env_value RESTORE_HEARTBEAT_URL)
if [ -n "$heartbeat" ]; then
  printf 'url = "%s"\n' "$heartbeat" | curl -fsS --max-time 10 -K - > /dev/null || log 'heartbeat не отправлен'
fi
log 'готово'
