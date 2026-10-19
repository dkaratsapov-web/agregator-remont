#!/usr/bin/env bash
# Учения на настоящих Docker и Postgres (ТЗ #40): bash scripts/drills.sh
# Только для одноразового стека (CI, отдельная машина): останавливает и пересоздаёт контейнеры,
# подменяет образы. Никогда не запускать на production.
# Ожидает запущенный стек `docker compose -f deploy/docker-compose.yml -f
# deploy/docker-compose.proxy.yml` с образами agregator-api:local и agregator-web:local.
# Сценарии:
#   1. копия базы (backup.sh) и проверка восстановления (restore-check.sh) во временном
#      контейнере; обрезанная копия — проверка восстановления не проходит;
#   2. сломанное обновление (API падает при старте) и откат rollback.sh на прошлую версию:
#      сайт снова отвечает, данные на месте;
#   3. несовместимая миграция (DROP COLUMN) применена к базе: откат отказывает, стек не тронут;
#      по порядку из отказа база восстанавливается из копии до миграции — откат проходит.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${DRILLS_DIR:-$(mktemp -d)}
mkdir -p "$WORK"
export STATE_DIR="$WORK/state" BACKUP_DIR="$WORK/backups" LOCK_FILE="$WORK/lock"
compose=(docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml)
failures=0
check() {
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (expected '$3', got '$2')"; failures=$((failures + 1)); fi
}
api_ready() {
  "${compose[@]}" exec -T api node -e \
    "fetch('http://localhost:4000/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" \
    > /dev/null 2>&1 && echo ready || echo down
}
wait_ready() {
  for _ in $(seq 1 60); do
    [ "$(api_ready)" = ready ] && return 0
    sleep 2
  done
  return 1
}
# Переменные раскрывает shell внутри контейнера db.
# shellcheck disable=SC2016
sql() { "${compose[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"' sh "$1"; }
status() { sed -n "s/^$2=//p" "$STATE_DIR/$1" 2> /dev/null; }

cd "$ROOT"
wait_ready || { echo 'стек не готов: API не отвечает'; exit 1; }
# Данные, по которым видно, что база та же после отката и в копии.
sql "insert into users (id, email, name, password_hash, role, updated_at)
     values ('drill-user', 'drill@example.ru', 'Учения', 'x', 'CUSTOMER', now())
     on conflict do nothing" > /dev/null
users_before=$(sql 'select count(*) from users')

# --- 1. Копия и проверка восстановления.
bash deploy/backup/backup.sh drill > "$WORK/out.log" 2>&1 && code=0 || code=$?
check 'backup: done' "$code" 0
check 'backup: mode recorded' "$(status backup-status mode)" local-only
dump=$(status backup-status file)
check 'backup: real pg_dump file' "$(head -c 5 "$dump" 2> /dev/null)" PGDMP
bash deploy/backup/restore-check.sh > "$WORK/restore.log" 2>&1 && code=0 || code=$?
check 'restore check: passed on a real Postgres' "$code $(status restore-status result)" '0 ok'
grep -q "users: $users_before;" "$WORK/restore.log" && restored=same || restored=differs
check 'restore check: same number of users as the live base' "$restored" same
# Готовность временной базы: проверка по сокету ловила временный сервер initdb и примерно
# в каждом пятом запуске падала (#40). Пять запусков подряд — все должны пройти.
repeat_ok=0
for _ in 1 2 3 4 5; do
  bash deploy/backup/restore-check.sh "$dump" >> "$WORK/restore-repeat.log" 2>&1 && repeat_ok=$((repeat_ok + 1))
done
check 'restore check: 5 runs in a row pass' "$repeat_ok" 5
head -c 4096 "$dump" > "$WORK/broken.dump"
bash deploy/backup/restore-check.sh "$WORK/broken.dump" > "$WORK/restore.log" 2>&1 && code=0 || code=$?
check 'restore check: truncated copy fails' "$code $(status restore-status result)" '1 failed'

# --- 1б. Копия вне сервера: настоящие age и rclone, «хранилище» — локальный каталог rclone.
if command -v age > /dev/null && command -v rclone > /dev/null; then
  age-keygen -o "$WORK/age.key" 2> /dev/null
  export ENV_FILE="$WORK/env.offsite"
  cp deploy/.env "$ENV_FILE"
  {
    echo "BACKUP_AGE_RECIPIENT=$(age-keygen -y "$WORK/age.key")"
    echo "BACKUP_RCLONE_REMOTE=:local:$WORK/offsite"
  } >> "$ENV_FILE"
  bash deploy/backup/backup.sh drill-offsite > "$WORK/out.log" 2>&1 && code=0 || code=$?
  check 'offsite backup: uploaded, size and checksum match' "$code $(status backup-status mode)" '0 offsite-hash-checked'
  # Как владелец проверяет копию вне сервера: скачанный .age и приватный ключ.
  uploaded=$(find "$WORK/offsite" -name '*.age' | tail -n 1)
  AGE_IDENTITY="$WORK/age.key" bash deploy/backup/restore-check.sh "$uploaded" > "$WORK/restore.log" 2>&1 && code=0 || code=$?
  check 'offsite backup: the encrypted copy restores' "$code $(status restore-status result)" '0 ok'
  grep -q "users: $users_before;" "$WORK/restore.log" && restored=same || restored=differs
  check 'offsite backup: same number of users as the live base' "$restored" same
  echo "BACKUP_RCLONE_REMOTE=:local:/proc/forbidden" >> "$ENV_FILE"
  bash deploy/backup/backup.sh drill-offsite > "$WORK/out.log" 2>&1 && code=0 || code=$?
  check 'offsite upload failure: error, local copy kept' \
    "$code $(status backup-status mode) $([ -f "$(status backup-status file)" ] && echo kept)" '1 local-only kept'
  unset ENV_FILE
else
  echo 'skip offsite drill: нет age или rclone'
fi

# --- 2. Сломанное обновление и откат на прошлую версию.
server="$WORK/server"
rm -rf "$server"
cp -a "$ROOT" "$server"
cd "$server"
git config user.email drill@example.ru
git config user.name drill
good=$(git rev-parse HEAD)
docker tag agregator-api:local "agregator-api:${good:0:12}"
docker tag agregator-web:local "agregator-web:${good:0:12}"
git commit -q --allow-empty -m 'drill: broken release'
bad=$(git rev-parse HEAD)
# API новой версии падает сразу при старте.
printf 'FROM agregator-api:local\nCMD ["node", "-e", "process.exit(1)"]\n' |
  docker build -q -t "agregator-api:${bad:0:12}" - > /dev/null
docker tag agregator-web:local "agregator-web:${bad:0:12}"
IMAGE_TAG=${bad:0:12} "${compose[@]}" up -d --no-build > /dev/null 2>&1 || true
sleep 5
check 'broken release: API is down' "$(api_ready)" down
mkdir -p "$STATE_DIR"
echo "$bad" > "$STATE_DIR/deployed"
printf '%s\n%s\n' "$good" "$bad" > "$STATE_DIR/history"
REPO_DIR=$server bash deploy/autodeploy/rollback.sh > "$WORK/rollback.log" 2>&1 && code=0 || code=$?
check 'rollback: done' "$code" 0
wait_ready && back=ready || back=down
check 'rollback: API answers again' "$back" ready
check 'rollback: previous version deployed' "$(cat "$STATE_DIR/deployed")" "$good"
check 'rollback: broken version marked failed' "$(cat "$STATE_DIR/failed")" "$bad"
check 'rollback: data kept' "$(sql 'select count(*) from users')" "$users_before"

# --- 3. Несовместимая миграция применена к базе: отказ; база восстановлена из копии — откат.
mkdir -p apps/api/prisma/migrations/29990101000000_drill
echo 'ALTER TABLE "jobs" DROP COLUMN "title";' > apps/api/prisma/migrations/29990101000000_drill/migration.sql
git add -A && git commit -q -m 'drill: incompatible migration'
newer=$(git rev-parse HEAD)
docker tag agregator-api:local "agregator-api:${newer:0:12}"
docker tag agregator-web:local "agregator-web:${newer:0:12}"
# Как автообновление: копия перед миграцией, затем миграция (по-настоящему, с записью в журнал
# миграций Prisma).
bash deploy/backup/backup.sh pre-migration > "$WORK/out.log" 2>&1
pre=$(status backup-status file)
sql 'ALTER TABLE "jobs" DROP COLUMN "title"' > /dev/null
sql "insert into _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count)
     values ('drill', 'drill', '29990101000000_drill', now(), 1)" > /dev/null
echo "$newer" > "$STATE_DIR/deployed"
printf '%s\n%s\n' "$good" "$newer" > "$STATE_DIR/history"
rm -f "$STATE_DIR/failed"
REPO_DIR=$server bash deploy/autodeploy/rollback.sh "$good" > "$WORK/rollback.log" 2>&1 && code=0 || code=$?
check 'rollback over applied DROP COLUMN: refused' "$code $(grep -c '^\[agregator-rollback\]   29990101000000_drill$' "$WORK/rollback.log")" '1 1'
check 'rollback over applied DROP COLUMN: still deployed' "$(cat "$STATE_DIR/deployed")" "$newer"
check 'rollback over applied DROP COLUMN: stack untouched' "$(api_ready)" ready
# Порядок из отказа: остановить api и web, восстановить копию перед миграцией, повторить откат.
"${compose[@]}" stop api web > /dev/null 2>&1
# Переменные раскрывает shell внутри контейнера db.
# shellcheck disable=SC2016
"${compose[@]}" exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < "$pre" > "$WORK/pg_restore.log" 2>&1 && code=0 || code=$?
check 'restore of the pre-migration copy into the live base' "$code" 0
check 'restored base: dropped column is back' "$(sql "select count(*) from information_schema.columns where table_name = 'jobs' and column_name = 'title'")" 1
REPO_DIR=$server bash deploy/autodeploy/rollback.sh "$good" > "$WORK/rollback.log" 2>&1 && code=0 || code=$?
check 'rollback after the restore: done' "$code $(grep -c 'опасных миграций в базе нет' "$WORK/rollback.log")" '0 1'
wait_ready && back=ready || back=down
check 'rollback after the restore: API answers' "$back" ready
check 'rollback after the restore: data kept' "$(sql 'select count(*) from users')" "$users_before"

cd "$ROOT"
if [ "$failures" -gt 0 ]; then
  echo "$failures drill check(s) failed; журналы: $WORK"
  exit 1
fi
echo 'Drills passed'
