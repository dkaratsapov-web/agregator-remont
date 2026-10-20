#!/usr/bin/env bash
# Обновление схемы на живых данных и совместимость версий (ТЗ #40, п. 6). Проверки раздела 1 и
# сценарии schema-compat-flow.mjs описывают переход «базовый коммит → этот PR»: PR, который
# меняет схему или контракт, обновляет их под свой переход.
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
  # API закрывает соединения с базой не мгновенно: ждём, чтобы база проверки освободилась.
  for pid in "${pids[@]}"; do wait "$pid" 2> /dev/null || true; done
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

psql "$PG/postgres" -Xqc "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE)" -c "CREATE DATABASE $DB_NAME"
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
# Проверки обновления — для миграций этого PR (меняются в каждом PR, который меняет схему).
check 'upgrade: plan and stage tables created' "$(q "select count(*) from information_schema.tables where table_name in ('job_plans', 'job_stages')")" 2
check 'upgrade: old jobs in progress have no plan' "$(q "select count(*) from job_plans")" 0
check 'upgrade: journal knows plan and stage actions' "$(q "select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'AuditAction' and e.enumlabel in ('PLAN_SAVED', 'PLAN_AUTHOR_CHANGED', 'PLAN_PROPOSED', 'PLAN_APPROVED', 'PLAN_RETURNED', 'STAGE_SUBMITTED', 'STAGE_ACCEPTED', 'STAGE_REWORK', 'CONTRACTOR_QUIT')")" 9
# Прежний код может удалить заказ: план не должен этому мешать (ON DELETE CASCADE).
q "insert into jobs (id, title, description, category, city, status, owner_id, updated_at) values
   ('j-gone', 'Удаляемый', 'Заказ, который удалит прежний код', 'TILING', 'Москва', 'IN_PROGRESS', 'u-c', now());
   insert into job_plans (id, job_id, updated_at) values ('p-gone', 'j-gone', now());
   insert into job_stages (id, plan_id, position, title, updated_at) values ('s-gone', 'p-gone', 1, 'Этап', now())" > /dev/null
q "delete from jobs where id = 'j-gone'" > /dev/null
check 'upgrade: deleting a job removes its plan and stages' "$(q "select count(*) from job_plans where id = 'p-gone'")/$(q "select count(*) from job_stages where id = 's-gone'")" 0/0

# --- 2 и 3. Прежний API на новой схеме, затем новый API на тех же данных.
start_api() { # каталог порт
  # exec: в pids — сам процесс node, а не subshell, иначе после проверки API остаётся жить.
  (cd "$1/apps/api" && DATABASE_URL=$DB API_PORT=$2 NODE_ENV=production \
    CORS_ORIGINS=https://remont.example TRUST_PROXY=loopback AUTH_RATE_LIMIT_PER_MIN=1000 \
    WRITE_RATE_LIMIT_PER_MIN=1000 exec node dist/main.js > "$WORK/api-$2.log" 2>&1) &
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
