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
#   BACKUP_REQUIRE_OFFSITE  true — копия без проверенной выгрузки вне сервера считается сбоем
#                         (публичный запуск); по умолчанию — предупреждение (закрытый тест)
#   BACKUP_HEARTBEAT_URL  адрес, который дёргается после успешной копии (healthchecks.io и т. п.)
# Итог — в STATE_DIR/backup-status: mode=offsite-hash-checked (копия выгружена, в хранилище тот
# же размер и та же контрольная сумма), offsite-size-checked (хранилище не отдаёт сумму —
# сверен только размер) или local-only (только на сервере). monitor.sh напоминает о local-only.
# Это проверка выгрузки, а не восстановимости: копию вне сервера проверяет restore-check.sh по
# скачанному файлу .age (deploy/README.md, «Резервные копии»).
# Сбой копии — выход с ошибкой и уведомление (notify.sh). Локальная копия при сбое выгрузки
# остаётся на сервере.
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
require_offsite=$(env_value BACKUP_REQUIRE_OFFSITE)
# Сбой выгрузки: локальная копия есть, это фиксируется до выхода с ошибкой.
offsite_failed() {
  rm -f "$file.age"
  write_status backup-status mode=local-only "file=$file" "label=$label" "offsite=failed"
  die "$1 (локальная копия сохранена: $file)"
}
if [ -n "$remote" ]; then
  [ -n "$recipient" ] || offsite_failed 'BACKUP_RCLONE_REMOTE задан без BACKUP_AGE_RECIPIENT: вне сервера только шифрованные копии'
  command -v age > /dev/null || offsite_failed 'не установлен age (apt install age)'
  command -v rclone > /dev/null || offsite_failed 'не установлен rclone (apt install rclone)'
  age -r "$recipient" -o "$file.age" "$file" || offsite_failed 'шифрование age не удалось'
  rclone copy --immutable "$file.age" "$remote" || offsite_failed "выгрузка в $remote не удалась"
  # Проверка по списку файлов хранилища (право на чтение содержимого не нужно): размер и, если
  # хранилище отдаёт контрольную сумму (SHA-256, SHA-1 или MD5 — зависит от хранилища), сумма.
  name=$(basename "$file.age")
  size=$(stat -c %s "$file.age")
  read -r stored hash_type stored_hash <<< "$(rclone lsjson --hash --files-only --include "/$name" "$remote" 2> /dev/null |
    python3 -c '
import json, sys
files = json.load(sys.stdin)
hashes = (files[0].get("Hashes") or {}) if files else {}
kind = next((k for k in ("sha256", "sha1", "md5") if hashes.get(k)), "-")
print(files[0]["Size"] if files else "-", kind, hashes.get(kind, "-"))' 2> /dev/null || echo '- - -')"
  [ "$stored" = "$size" ] || offsite_failed "в $remote нет $name нужного размера (ожидалось $size, найдено $stored)"
  mode=offsite-size-checked
  if [ "$hash_type" != - ]; then
    [ "$("${hash_type}sum" "$file.age" | cut -d' ' -f1)" = "$stored_hash" ] ||
      offsite_failed "в $remote у $name другая контрольная сумма ($hash_type): файл повреждён при выгрузке"
    mode=offsite-hash-checked
  fi
  rm -f "$file.age"
  write_status backup-status "mode=$mode" "file=$file" "label=$label" "remote=$remote"
  log "выгружено в $remote (шифровано), проверка в хранилище: $mode"
else
  write_status backup-status mode=local-only "file=$file" "label=$label" offsite=not-configured
  # Публичный запуск: без копии вне сервера — сбой (fail closed); локальная копия остаётся.
  [ "$require_offsite" != true ] ||
    die "BACKUP_REQUIRE_OFFSITE=true, а выгрузка не настроена (BACKUP_RCLONE_REMOTE): копия только на сервере ($file)"
  log 'ВНИМАНИЕ: копия только на сервере (BACKUP_RCLONE_REMOTE не задан): при потере сервера она потеряется'
fi

# На сервере хранятся копии за последние BACKUP_KEEP_DAYS дней; вне сервера — по правилам хранилища.
find "$dir" -maxdepth 1 -name 'agregator-*.dump' -mtime "+$keep" -delete

heartbeat=$(env_value BACKUP_HEARTBEAT_URL)
if [ -n "$heartbeat" ]; then
  printf 'url = "%s"\n' "$heartbeat" | curl -fsS --max-time 10 -K - > /dev/null || log 'heartbeat не отправлен'
fi
log 'готово'
