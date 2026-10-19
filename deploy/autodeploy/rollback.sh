#!/usr/bin/env bash
# Быстрый откат на предыдущую развёрнутую версию: sudo bash deploy/autodeploy/rollback.sh [sha]
# Без аргумента — предпоследний коммит из истории автообновления. Образы этой версии уже есть на
# сервере (deploy.sh хранит KEEP_RELEASES последних), поэтому сборки нет: переключение занимает
# около минуты. Откатываемый коммит помечается неудачным, автообновление его не вернёт; следующий
# новый коммит в main развернётся как обычно.
# Миграции базы назад НЕ откатываются: если новая версия изменила схему, старая должна с ней
# работать (правило совместимых миграций, deploy/README.md). Перед откатом проверяется:
# рабочая копия без правок, сохранённый развёрнутый SHA, Docker отвечает, образы прежней версии
# есть, миграции между версиями совместимы со старым кодом (migration-check.sh). Несовместимые
# миграции — отказ и порядок действий (восстановление из копии), не откат поверх новой схемы.
set -euo pipefail

REPO_DIR=${REPO_DIR:-/opt/agregator}
STATE_DIR=${STATE_DIR:-/var/lib/agregator-deploy}
LOCK_FILE=${LOCK_FILE:-/run/agregator-deploy.lock}
# shellcheck source=deploy/autodeploy/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

log() { echo "[agregator-rollback] $*"; }
die() {
  log "ОШИБКА: $1"
  exit 1
}

exec 9>"$LOCK_FILE"
flock -n 9 || die 'идёт автообновление, повторите через пару минут'
cd "$REPO_DIR"
# Правки на сервере вручную потерялись бы при git reset --hard.
if ! git diff --quiet || ! git diff --cached --quiet; then
  die 'в рабочей копии на сервере есть изменения (git status): сохраните или уберите их, затем повторите'
fi
[ -s "$STATE_DIR/deployed" ] || die "нет сохранённого развёрнутого SHA ($STATE_DIR/deployed): откат вручную по deploy/README.md"
docker info > /dev/null 2>&1 || die 'Docker не отвечает (systemctl status docker)'
compose=(docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml)
if grep -Eq '^BANK_LOGIN=true[[:space:]]*$' deploy/.env 2> /dev/null; then
  compose+=(-f deploy/docker-compose.bank-login.yml)
fi

current=$(cat "$STATE_DIR/deployed")
target=${1:-$(grep -vx "$current" "$STATE_DIR/history" 2> /dev/null | tail -n 1 || true)}
[ -n "$target" ] || die 'в истории нет предыдущей версии; укажите коммит: rollback.sh <sha>'
target=$(git rev-parse --verify "$target^{commit}" 2> /dev/null) || die "нет коммита $1"
[ "$target" != "$current" ] || die 'это уже текущая версия'
export IMAGE_TAG=${target:0:12}
for image in "agregator-api:$IMAGE_TAG" "agregator-web:$IMAGE_TAG"; do
  docker image inspect "$image" > /dev/null 2>&1 || die "нет образа $image: эта версия не хранится, нужна сборка (git revert и CI)"
done

# Старые образы встанут поверх новой схемы: допустимо, только если миграции после target
# совместимы со старым кодом.
# ROLLBACK_SCHEMA_RESTORED=yes — база уже восстановлена из копии, сделанной до этих миграций.
if [ "${ROLLBACK_SCHEMA_RESTORED:-}" != yes ] &&
  ! bash "$(dirname "$0")/migration-check.sh" "$target" "$current"; then
  backups=$(env_value BACKUP_DIR)
  log 'Откат на старые образы опасен: старый API может не работать с новой схемой базы.'
  log 'Порядок (решение — только владельца: данные, записанные после миграции, потеряются):'
  log '  1) остановить api и web: docker compose ... stop api web;'
  log "  2) восстановить копию перед миграцией из ${backups:-/var/backups/agregator}/*-pre-migration.dump"
  log '     (pg_restore --clean, deploy/README.md «Резервные копии»);'
  log "  3) ROLLBACK_SCHEMA_RESTORED=yes bash deploy/autodeploy/rollback.sh $target"
  die 'миграции между версиями несовместимы со старым кодом, откат остановлен'
fi
log "откат ${current:0:12} -> ${target:0:12}"
git reset --quiet --hard "$target"
"${compose[@]}" up -d --no-build --remove-orphans || die 'переключение контейнеров не удалось'
if ! git diff --quiet "$target" "$current" -- deploy/Caddyfile; then
  "${compose[@]}" restart caddy || die 'перезапуск Caddy не удался'
fi
echo "$current" > "$STATE_DIR/failed"
echo "$target" > "$STATE_DIR/deployed"
rm -f "$STATE_DIR/attempts"
notify "выполнен откат ${current:0:12} -> ${target:0:12}"
log "готово: работает ${target:0:12}; ${current:0:12} помечен неудачным"
