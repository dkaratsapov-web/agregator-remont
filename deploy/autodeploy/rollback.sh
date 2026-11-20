#!/usr/bin/env bash
# Быстрый откат на предыдущую развёрнутую версию: sudo bash deploy/autodeploy/rollback.sh [sha]
# Без аргумента — предыдущий коммит из истории автообновления (версии, с которых уже откатывались,
# в ней не остаются). Образы этой версии уже есть на
# сервере (deploy.sh хранит KEEP_RELEASES последних), поэтому сборки нет: переключение занимает
# около минуты. Откатываемый коммит помечается неудачным, автообновление его не вернёт; следующий
# новый коммит в main развернётся как обычно.
# Миграции базы назад НЕ откатываются: если новая версия изменила схему, старая должна с ней
# работать (правило совместимых миграций, deploy/README.md). Перед откатом проверяется:
# рабочая копия без правок и без посторонних файлов, которые перезапишет git reset; сохранённый
# развёрнутый SHA; Docker отвечает; образы прежней версии есть; миграции между версиями
# совместимы со старым кодом (migration-check.sh). Если нет — откат разрешён, только когда в
# самой базе нет ни одной миграции новее целевой версии (база восстановлена из копии до них);
# иначе отказ и порядок действий. Флагов «я всё проверил» нет: проверяется сама база.
# Запускает только человек (автообновление откат не вызывает).
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
# Правки на сервере вручную потерялись бы при git reset --hard: изменённые, добавленные и
# неотслеживаемые файлы (git status), а также игнорируемые файлы по путям, которые целевая
# версия хранит в git (их reset перезапишет молча) — проверка после выбора версии.
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  git status --short --untracked-files=all | head -n 20
  die 'в рабочей копии на сервере есть изменения или посторонние файлы (выше): сохраните или уберите их, затем повторите'
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
# Игнорируемый файл (например, временный дамп) по пути, который есть в целевой версии.
clobbered=$(comm -23 <(git ls-tree -r --name-only "$target" | sort) <(git ls-files | sort) |
  while IFS= read -r path; do if [ -e "$path" ]; then echo "$path"; fi; done)
if [ -n "$clobbered" ]; then
  echo "$clobbered" | head -n 20
  die 'эти файлы на сервере перезапишет откат (в целевой версии они в git): перенесите их, затем повторите'
fi
export IMAGE_TAG=${target:0:12}
for image in "agregator-api:$IMAGE_TAG" "agregator-web:$IMAGE_TAG"; do
  docker image inspect "$image" > /dev/null 2>&1 || die "нет образа $image: эта версия не хранится, нужна сборка (git revert и CI)"
done

# Старые образы встанут поверх новой схемы: допустимо, если миграции после target совместимы
# со старым кодом, или если опасных из них в базе нет (восстановлена из копии до них).
if ! bash "$(dirname "$0")/migration-check.sh" "$target" "$current"; then
  unsafe=$(python3 "$(dirname "$0")/migration_check.py" --list-unsafe "$target" "$current")
  # Применённые миграции в живой базе против миграций целевой версии.
  # shellcheck disable=SC2016 # переменные раскрываются внутри контейнера db
  applied=$("${compose[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XtAc \
    "select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null"') ||
    die 'база не отвечает: не проверить, какие миграции в ней применены (docker compose ... ps db)'
  newer=$(comm -12 <(printf '%s\n' "$applied" | sed '/^$/d' | sort) <(printf '%s\n' "$unsafe" | sort))
  if [ -n "$newer" ]; then
    backups=$(env_value BACKUP_DIR)
    log 'Откат на старые образы опасен: старый API может не работать с новой схемой базы.'
    log "В базе применены опасные для ${target:0:12} миграции:"
    while IFS= read -r migration; do log "  $migration"; done <<< "$newer"
    log 'Порядок (решение — только владельца: данные, записанные после миграции, потеряются):'
    log '  1) остановить api и web: docker compose ... stop api web;'
    log "  2) восстановить копию перед миграцией из ${backups:-/var/backups/agregator}/*-pre-migration.dump"
    log '     (pg_restore --clean, deploy/README.md «Резервные копии»);'
    log "  3) повторить: bash deploy/autodeploy/rollback.sh $target — откат проверит базу сам."
    die 'миграции между версиями несовместимы со старым кодом, откат остановлен'
  fi
  log "опасных миграций в базе нет (база восстановлена до них): откат допустим"
fi

# Модерация (миграция 20261023100000_moderation): версия без неё схему читает, но правил не
# знает — скрытые модератором заказы, сообщения и отклики снова увидят все. Блокировку держит
# сама база (триггер sessions_refuse_blocked_user), а скрытое — нет. Поэтому откат на такую
# версию — только когда скрытого в базе нет (или база восстановлена из копии до модерации).
MODERATION=apps/api/prisma/migrations/20261023100000_moderation/migration.sql
if ! git cat-file -e "$target:$MODERATION" 2> /dev/null; then
  # shellcheck disable=SC2016 # переменные раскрываются внутри контейнера db
  db_query() { "${compose[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -XtAc "$0"' "$1"; }
  columns=$(db_query "select count(*) from information_schema.columns where column_name = 'hidden_at' and table_name in ('jobs', 'bids', 'job_messages')") ||
    die 'база не отвечает: не проверить скрытое модератором (docker compose ... ps db)'
  if [ "${columns//[[:space:]]/}" = 3 ]; then
    hidden=$(db_query "select (select count(*) from jobs where hidden_at is not null) + (select count(*) from bids where hidden_at is not null) + (select count(*) from job_messages where hidden_at is not null)") ||
      die 'база не отвечает: не проверить скрытое модератором (docker compose ... ps db)'
    hidden=${hidden//[[:space:]]/}
    if [ "${hidden:-0}" != 0 ]; then
      log "Версия ${target:0:12} не знает модерации, а в базе скрыто модератором: $hidden (заказы, сообщения, отклики)."
      log 'После отката их снова увидят все. Варианты (решение — только владельца):'
      log '  1) откатиться на версию с модерацией (слияние PR #45 или новее);'
      log '  2) вернуть скрытое в /admin/reports, если это допустимо, и повторить откат;'
      log '  3) восстановить копию перед миграцией модерации (данные после неё потеряются).'
      die 'откат на версию без модерации раскрыл бы скрытое содержимое, откат остановлен'
    fi
  fi
fi
log "откат ${current:0:12} -> ${target:0:12}"
git reset --quiet --hard "$target"
# Сбой после переключения кода: рабочая копия возвращается на текущую версию, состояние
# (deployed, failed) не меняется — ничего не помечается успешным; владелец получает уведомление.
switch_failed() {
  git reset --quiet --hard "$current"
  notify "откат ${current:0:12} -> ${target:0:12} не удался: $1; контейнеры могли переключиться частично, docker compose ... ps"
  die "$1; рабочая копия возвращена на ${current:0:12}, состояние не изменено. Проверьте docker compose ... ps и повторите откат или обновление"
}
"${compose[@]}" up -d --no-build --remove-orphans || switch_failed 'переключение контейнеров не удалось'
if ! git diff --quiet "$target" "$current" -- deploy/Caddyfile; then
  "${compose[@]}" restart caddy || switch_failed 'перезапуск Caddy не удался'
fi
echo "$current" > "$STATE_DIR/failed"
echo "$target" > "$STATE_DIR/deployed"
rm -f "$STATE_DIR/attempts"
# Откаченная версия уходит из истории: следующий откат без аргумента (подряд или после нового
# обновления) не вернёт на неё, а пойдёт на шаг назад.
{ grep -vx "$current" "$STATE_DIR/history" 2> /dev/null || true; } > "$STATE_DIR/history.new" &&
  mv "$STATE_DIR/history.new" "$STATE_DIR/history"
notify "выполнен откат ${current:0:12} -> ${target:0:12}"
log "готово: работает ${target:0:12}; ${current:0:12} помечен неудачным"
