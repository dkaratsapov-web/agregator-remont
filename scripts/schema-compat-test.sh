#!/usr/bin/env bash
# Обновление схемы на живых данных и совместимость версий (ТЗ #40, п. 6):
#   bash scripts/schema-compat-test.sh [базовый коммит, по умолчанию origin/main]
# 1. База на схеме базового коммита с данными прежнего формата (открытый, в работе и закрытый
#    заказы, ожидающие, выбранные и отклонённые отклики) → новые миграции: новые поля заполнены
#    как задумано, индексы и расширение созданы, старые строки не тронуты.
# 2. Прежний API (собран из базового коммита) работает на новой схеме — время между migrate и
#    стартом нового API и откат без восстановления базы.
# 3. Новый API читает данные прежнего.
# Нужны: Postgres (COMPAT_PG — адрес сервера без имени базы), pnpm, собранный текущий API
# (apps/api/dist). База agregator_compat пересоздаётся.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
base=${1:-origin/main}
PG=${COMPAT_PG:-postgresql://agregator:agregator@localhost:5432}
DB_NAME=agregator_compat
DB="$PG/$DB_NAME?schema=public"
WORK=$(mktemp -d)
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2> /dev/null || true; done
  git -C "$ROOT" worktree remove --force "$WORK/base" 2> /dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT
failures=0
check() {
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (expected '$3', got '$2')"; failures=$((failures + 1)); fi
}
q() { psql "$PG/$DB_NAME" -XtAc "$1"; }

echo "Базовый коммит: $(git -C "$ROOT" rev-parse --short "$base")"
git -C "$ROOT" worktree add -q --detach "$WORK/base" "$base"
(
  cd "$WORK/base"
  pnpm install --frozen-lockfile --prefer-offline > /dev/null
  pnpm --filter @agregator/shared build > /dev/null
  pnpm --filter @agregator/api build > /dev/null
)

psql "$PG/postgres" -Xqc "DROP DATABASE IF EXISTS $DB_NAME" -c "CREATE DATABASE $DB_NAME"
(cd "$WORK/base/apps/api" && DATABASE_URL=$DB pnpm exec prisma migrate deploy > /dev/null)

# --- 1. Данные прежнего формата.
q "insert into users (id, email, name, password_hash, role, updated_at) values
   ('u-c', 'legacy-c@example.ru', 'Заказчик', 'x', 'CUSTOMER', now()),
   ('u-a', 'legacy-a@example.ru', 'Мастер А', 'x', 'CONTRACTOR', now()),
   ('u-b', 'legacy-b@example.ru', 'Мастер Б', 'x', 'CONTRACTOR', now())" > /dev/null
q "insert into jobs (id, title, description, category, city, status, owner_id, updated_at) values
   ('j-open', 'Старый открытый', 'Описание старого открытого заказа', 'TILING', 'Москва', 'OPEN', 'u-c', now()),
   ('j-work', 'Старый в работе', 'Описание старого заказа в работе', 'FLOORING', 'Москва', 'IN_PROGRESS', 'u-c', now()),
   ('j-closed', 'Старый закрытый', 'Описание старого закрытого заказа', 'PLUMBING', 'Казань', 'CLOSED', 'u-c', now())" > /dev/null
q "insert into bids (id, job_id, contractor_id, price, comment, status, updated_at) values
   ('b-pending', 'j-open', 'u-a', 1000, 'Ожидающий отклик', 'PENDING', now()),
   ('b-accepted', 'j-work', 'u-a', 2000, 'Выбранный отклик', 'ACCEPTED', now()),
   ('b-lost', 'j-work', 'u-b', 2500, 'Не выбранный отклик', 'REJECTED', now()),
   ('b-closed', 'j-closed', 'u-b', 3000, 'Отклик на закрытый', 'REJECTED', now())" > /dev/null
before=$(q "select count(*) from jobs")/$(q "select count(*) from bids")

(cd "$ROOT/apps/api" && DATABASE_URL=$DB pnpm exec prisma migrate deploy > /dev/null)
check 'upgrade: rows kept' "$(q "select count(*) from jobs")/$(q "select count(*) from bids")" "$before"
check 'upgrade: rejected next to an accepted bid → OTHER_ACCEPTED' "$(q "select reject_reason from bids where id = 'b-lost'")" OTHER_ACCEPTED
check 'upgrade: rejected on a closed job → JOB_CLOSED' "$(q "select reject_reason from bids where id = 'b-closed'")" JOB_CLOSED
check 'upgrade: pending and accepted bids have no reason' "$(q "select count(*) from bids where id in ('b-pending', 'b-accepted') and reject_reason is null")" 2
check 'upgrade: old closed job has no outcome' "$(q "select coalesce(close_outcome::text, 'null') from jobs where id = 'j-closed'")" null
check 'upgrade: old jobs have no publish key' "$(q "select count(*) from jobs where request_id is null and request_hash is null")" 3
check 'upgrade: old bids have no job-changed mark' "$(q "select count(*) from bids where job_changed_at is null")" 4
check 'upgrade: pg_trgm installed' "$(q "select count(*) from pg_extension where extname = 'pg_trgm'")" 1
check 'upgrade: catalog indexes created' "$(q "select count(*) from pg_indexes where indexname in ('jobs_title_trgm_idx', 'jobs_description_trgm_idx', 'jobs_city_trgm_idx', 'jobs_open_created_at_idx')")" 4
check 'upgrade: unused index dropped' "$(q "select count(*) from pg_indexes where indexname = 'jobs_category_created_at_idx'")" 0

# --- 2 и 3. Прежний API на новой схеме, затем новый API на тех же данных.
start_api() { # каталог порт
  (cd "$1/apps/api" && DATABASE_URL=$DB API_PORT=$2 NODE_ENV=production \
    CORS_ORIGINS=https://remont.example TRUST_PROXY=loopback AUTH_RATE_LIMIT_PER_MIN=1000 \
    WRITE_RATE_LIMIT_PER_MIN=1000 node dist/main.js > "$WORK/api-$2.log" 2>&1) &
  pids+=($!)
  for _ in $(seq 1 60); do
    curl -fs -o /dev/null "http://127.0.0.1:$2/health" && return 0
    sleep 1
  done
  echo "API на порту $2 не поднялся:"
  tail -20 "$WORK/api-$2.log"
  return 1
}
export COMPAT_STATE="$WORK/state.json"
start_api "$WORK/base" 4110
node "$ROOT/scripts/schema-compat-flow.mjs" old http://127.0.0.1:4110 || failures=$((failures + 1))
start_api "$ROOT" 4111
node "$ROOT/scripts/schema-compat-flow.mjs" new http://127.0.0.1:4111 || failures=$((failures + 1))

if [ "$failures" -gt 0 ]; then
  echo "$failures schema compatibility check(s) failed"
  exit 1
fi
echo 'Schema compatibility checks passed'
