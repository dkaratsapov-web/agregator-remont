#!/usr/bin/env bash
# Резервная копия базы: sudo bash deploy/backup/backup.sh [метка]
# Запускается таймером каждый день (deploy/autodeploy/install.sh) и автообновлением перед новой
# миграцией (метка pre-migration). Копия pg_dump (формат custom) кладётся в BACKUP_DIR вне
# репозитория с правами 600 и, если настроено, шифруется (age) и выгружается вне сервера (rclone).
# Настройки в deploy/.env:
#   BACKUP_DIR            каталог копий на сервере (по умолчанию /var/backups/agregator)
#   BACKUP_KEEP_DAYS      сколько дней хранить копии на сервере (по умолчанию 14)
#   BACKUP_AGE_RECIPIENT  публичный ключ age для копии вне сервера (приватный — офлайн у владельца)
#   BACKUP_RCLONE_REMOTE  куда выгружать, например s3backup:agregator-backups (настройка rclone —
#                         deploy/README.md, «Резервные копии»); ключ хранилища только на запись
#   BACKUP_HEARTBEAT_URL  адрес, который дёргается после успешной копии (healthchecks.io и т. п.)
# Сбой копии — выход с ошибкой и уведомление (notify.sh).
set -euo pipefail

REPO_DIR=${REPO_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
# shellcheck source=deploy/autodeploy/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/../autodeploy/lib.sh"
cd "$REPO_DIR"

label=${1:-daily}
case "$label" in *[!a-z0-9-]*) echo "метка: только a-z, 0-9 и -" >&2; exit 2 ;; esac
dir=${BACKUP_DIR:-$(env_value BACKUP_DIR)}
dir=${dir:-/var/backups/agregator}
keep=$(env_value BACKUP_KEEP_DAYS)
keep=${keep:-14}
compose=(docker compose -f deploy/docker-compose.yml)

log() { echo "[agregator-backup] $*"; }
die() {
  log "ОШИБКА: $1"
  notify "резервная копия ($label) не сделана: $1"
  exit 1
}

umask 077
mkdir -p "$dir"
chmod 700 "$dir"
file="$dir/agregator-$(date -u +%Y%m%dT%H%M%SZ)-$label.dump"

# Переменные раскрывает shell внутри контейнера db (его POSTGRES_USER и POSTGRES_DB).
# shellcheck disable=SC2016
"${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$file.part" || { rm -f "$file.part"; die 'pg_dump завершился с ошибкой'; }
# Формат custom начинается с «PGDMP»: пустой или обрезанный вывод копией не считается.
if [ "$(head -c 5 "$file.part")" != PGDMP ]; then
  rm -f "$file.part"
  die 'pg_dump вернул не копию базы'
fi
mv "$file.part" "$file"
log "копия: $file ($(du -h "$file" | cut -f1))"

recipient=$(env_value BACKUP_AGE_RECIPIENT)
remote=$(env_value BACKUP_RCLONE_REMOTE)
if [ -n "$remote" ]; then
  [ -n "$recipient" ] || die 'BACKUP_RCLONE_REMOTE задан без BACKUP_AGE_RECIPIENT: вне сервера только шифрованные копии'
  command -v age > /dev/null || die 'не установлен age (apt install age)'
  command -v rclone > /dev/null || die 'не установлен rclone (apt install rclone)'
  age -r "$recipient" -o "$file.age" "$file" || die 'шифрование age не удалось'
  rclone copy --immutable "$file.age" "$remote" || { rm -f "$file.age"; die "выгрузка в $remote не удалась"; }
  rm -f "$file.age"
  log "выгружено в $remote (шифровано)"
fi

# На сервере хранятся копии за последние BACKUP_KEEP_DAYS дней; вне сервера — по правилам хранилища.
find "$dir" -maxdepth 1 -name 'agregator-*.dump' -mtime "+$keep" -delete

heartbeat=$(env_value BACKUP_HEARTBEAT_URL)
if [ -n "$heartbeat" ]; then
  printf 'url = "%s"\n' "$heartbeat" | curl -fsS --max-time 10 -K - > /dev/null || log 'heartbeat не отправлен'
fi
log 'готово'
