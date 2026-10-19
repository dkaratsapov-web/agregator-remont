#!/usr/bin/env bash
# Проверка копии вне сервера целиком: скачать из хранилища, расшифровать, восстановить.
#   AGE_IDENTITY=<приватный ключ age> bash deploy/backup/offsite-restore-check.sh <remote>
# remote — то же хранилище rclone, что BACKUP_RCLONE_REMOTE, но с ключом только на чтение
# (по умолчанию — значение BACKUP_RCLONE_READ_REMOTE из deploy/.env).
#
# Запускать там, где есть приватный ключ age и Docker, а production нет: компьютер владельца
# или отдельная одноразовая машина. На сервере приватного ключа нет намеренно.
#
# Чем отличается от backup.sh: backup.sh сверяет размер и контрольную сумму выгруженного файла
# (выгрузка дошла целой), но не открывает копию. Здесь проверяется то, что нужно при потере
# сервера: последняя копия в хранилище свежая, зашифрована, расшифровывается ключом владельца и
# восстанавливается в чистый Postgres со всеми таблицами (restore-check.sh).
# Итог — в STATE_DIR/offsite-restore-status (result, file, age_hours, seconds).
set -euo pipefail

REPO_DIR=${REPO_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}
# shellcheck source=deploy/autodeploy/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/../autodeploy/lib.sh"
cd "$REPO_DIR"

remote=${1:-$(env_value BACKUP_RCLONE_READ_REMOTE)}
# Копии делаются раз в сутки: старше 48 ч — значит, выгрузка перестала работать.
max_age_hours=${OFFSITE_MAX_AGE_HOURS:-48}

log() { echo "[agregator-offsite-restore] $*"; }
die() {
  log "ОШИБКА: $1"
  write_status offsite-restore-status result=failed "reason=$1"
  exit 1
}

[ -n "$remote" ] || die 'не указано хранилище (аргумент или BACKUP_RCLONE_READ_REMOTE)'
if [ -z "${AGE_IDENTITY:-}" ] || [ ! -f "$AGE_IDENTITY" ]; then
  die 'укажите приватный ключ age в AGE_IDENTITY'
fi
command -v rclone > /dev/null || die 'не установлен rclone'

listing=$(rclone lsjson --files-only "$remote" 2> /dev/null) || die "хранилище $remote не читается"
# Копии называются agregator-<UTC время>-<метка>.dump(.age): последняя — наибольшая по имени.
# Незашифрованная копия в хранилище — уже нарушение: вне сервера только шифрованные.
read -r latest plain <<< "$(printf '%s' "$listing" | python3 -c '
import json, sys
names = [f["Name"] for f in json.load(sys.stdin)]
copies = sorted(n for n in names if n.startswith("agregator-") and n.endswith(".dump.age"))
plain = [n for n in names if n.endswith(".dump")]
print(copies[-1] if copies else "-", plain[0] if plain else "-")')"
[ "$plain" = - ] || die "в $remote лежит незашифрованная копия $plain"
[ "$latest" != - ] || die "в $remote нет копий agregator-*.dump.age"

stamp=$(printf '%s' "$latest" | sed -n 's/^agregator-\([0-9]\{8\}T[0-9]\{6\}Z\)-.*/\1/p')
[ -n "$stamp" ] || die "непонятное имя копии $latest"
taken=$(date -u -d "$(printf '%s' "$stamp" | sed 's/^\(....\)\(..\)\(..\)T\(..\)\(..\)\(..\)Z$/\1-\2-\3 \4:\5:\6/')" +%s)
age_hours=$((($(date +%s) - taken) / 3600))
log "последняя копия: $latest ($age_hours ч назад)"
[ "$age_hours" -le "$max_age_hours" ] ||
  die "последней копии в $remote $age_hours ч (порог $max_age_hours ч): выгрузка не работает"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rclone copyto "$remote/$latest" "$work/$latest" 2> /dev/null || die "не удалось скачать $latest"
# Восстановление во временный Postgres без сети — тот же restore-check.sh, итог отдельно от
# еженедельной проверки локальной копии на сервере.
if ! RESTORE_STATUS=offsite-restore-check AGE_IDENTITY=$AGE_IDENTITY \
  bash "$REPO_DIR/deploy/backup/restore-check.sh" "$work/$latest"; then
  die "копия $latest не восстановилась: $(status_value offsite-restore-check reason)"
fi
write_status offsite-restore-status result=ok "file=$latest" "age_hours=$age_hours" \
  "seconds=$(status_value offsite-restore-check seconds)" "migrations=$(status_value offsite-restore-check migrations)"
log "готово: копия вне сервера восстанавливается ($(status_value offsite-restore-check seconds) с)"
