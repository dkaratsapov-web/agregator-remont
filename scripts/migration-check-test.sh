#!/usr/bin/env bash
# Тест deploy/autodeploy/migration-check.sh на временном репозитории: bash scripts/migration-check-test.sh
# Каждый случай — отдельный коммит с миграцией поверх базового; ожидается код 0 (совместимо) или
# 2 (опасно). Случаи из независимого аудита #40: многострочные ALTER, DROP INDEX, пометка
# только у одного оператора из нескольких, изменённая и удалённая миграция, enum, ограничения.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
CHECK="$ROOT/deploy/autodeploy/migration-check.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
LOG="$WORK/out.log"
mkdir "$WORK/repo"
cd "$WORK/repo"
git init -q -b main
git config user.email t@example.ru && git config user.name test
dir=apps/api/prisma/migrations
mkdir -p "$dir/0_init"
printf 'CREATE TABLE "jobs" ("id" TEXT NOT NULL, "title" TEXT NOT NULL, CONSTRAINT "jobs_pkey" PRIMARY KEY ("id"));\n' > "$dir/0_init/migration.sql"
git add -A && git commit -qm init
base=$(git rev-parse HEAD)

failures=0
# case <имя> <ожидаемый код> <SQL новой миграции>
case_sql() {
  git checkout -q --detach "$base"
  mkdir -p "$dir/1_case"
  printf '%s\n' "$3" > "$dir/1_case/migration.sql"
  git add -A && git commit -qm "$1"
  verdict "$1" "$2"
}
verdict() {
  local code=0
  bash "$CHECK" "$base" HEAD > "$LOG" 2>&1 || code=$?
  if [ "$code" = "$2" ]; then
    echo "ok   $1"
  else
    echo "FAIL $1 (expected exit $2, got $code)"
    sed 's/^/     /' "$LOG"
    failures=$((failures + 1))
  fi
}

# Опасное, в том числе разнесённое по строкам.
case_sql 'multiline ALTER COLUMN TYPE' 2 'ALTER TABLE "jobs"
  ALTER COLUMN "title"
  TYPE VARCHAR(10);'
case_sql 'multiline SET NOT NULL' 2 'ALTER TABLE "jobs" ADD COLUMN "city" TEXT;
ALTER TABLE "jobs"
  ALTER COLUMN "city"
  SET NOT NULL;'
case_sql 'multiline required column without DEFAULT' 2 'ALTER TABLE "jobs"
  ADD COLUMN "city"
  TEXT NOT NULL;'
case_sql 'DROP COLUMN' 2 'ALTER TABLE "jobs" DROP COLUMN "title";'
case_sql 'DROP INDEX' 2 'DROP INDEX "jobs_title_idx";'
case_sql 'DROP TABLE' 2 'DROP TABLE "jobs";'
case_sql 'RENAME COLUMN' 2 'ALTER TABLE "jobs" RENAME COLUMN "title" TO "name";'
case_sql 'rename constraint' 2 'ALTER TABLE "jobs" RENAME CONSTRAINT "jobs_pkey" TO "jobs_pk";'
case_sql 'DROP NOT NULL' 2 'ALTER TABLE "jobs" ALTER COLUMN "title" DROP NOT NULL;'
case_sql 'CHECK constraint on an existing table' 2 'ALTER TABLE "jobs" ADD CONSTRAINT "title_len" CHECK (length("title") > 3);'
case_sql 'unique index on an existing table' 2 'CREATE UNIQUE INDEX "jobs_title_key" ON "jobs"("title");'
case_sql 'enum: new value' 2 "ALTER TYPE \"Status\" ADD VALUE 'X';"
case_sql 'enum: renamed value' 2 "ALTER TYPE \"Status\" RENAME VALUE 'A' TO 'B';"
case_sql 'function' 2 'CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN RETURN NEW; END; $$ LANGUAGE plpgsql;'
case_sql 'several actions, one dangerous' 2 'ALTER TABLE "jobs" ADD COLUMN "city" TEXT, DROP COLUMN "title";'
case_sql 'unknown statement' 2 'TRUNCATE "jobs";'

# Пометка действует только на оператор сразу после неё.
case_sql 'marker on a safe statement does not cover a dangerous one' 2 '-- rollback-safe: столбец новый
ALTER TABLE "jobs" ADD COLUMN "city" TEXT;
ALTER TABLE "jobs" DROP COLUMN "title";'
case_sql 'marker covers only the next statement' 2 '-- rollback-safe: индекс не используется
DROP INDEX "a_idx";
DROP INDEX "b_idx";'
case_sql 'marker inside a statement does not count' 2 'ALTER TABLE "jobs"
-- rollback-safe: так нельзя
DROP COLUMN "title";'
case_sql 'marker without a reason does not count' 2 '-- rollback-safe:
DROP INDEX "a_idx";'
case_sql 'marked dangerous statement is allowed' 0 '-- rollback-safe: индекс не используется ни одним запросом
DROP INDEX "a_idx";'

# Безопасное.
case_sql 'nullable column' 0 'ALTER TABLE "jobs" ADD COLUMN "city" TEXT;'
case_sql 'required column with DEFAULT' 0 "ALTER TABLE \"jobs\"
  ADD COLUMN \"kind\" TEXT NOT NULL
  DEFAULT 'x';"
case_sql 'SET DEFAULT' 0 "ALTER TABLE \"jobs\" ALTER COLUMN \"title\" SET DEFAULT '';"
case_sql 'index, extension, enum type, backfill' 0 "CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX \"jobs_title_idx\" ON \"jobs\" USING GIN (\"title\" gin_trgm_ops);
CREATE TYPE \"Outcome\" AS ENUM ('A', 'B');
ALTER TABLE \"jobs\" ADD COLUMN \"outcome\" \"Outcome\";
UPDATE \"jobs\" SET \"outcome\" = 'A' WHERE \"title\" = 'x';"
case_sql 'new table with its own constraints' 0 'CREATE TABLE "bids" ("id" TEXT NOT NULL, "job_id" TEXT NOT NULL, CONSTRAINT "bids_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "bids_job_id_key" ON "bids"("job_id");
ALTER TABLE "bids" ADD CONSTRAINT "bids_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;'
case_sql 'dangerous words in comments and strings are not operations' 0 "/* DROP TABLE \"jobs\"; */
-- ALTER TABLE \"jobs\" DROP COLUMN \"title\";
UPDATE \"jobs\" SET \"title\" = 'x; DROP TABLE y' WHERE \"id\" = '1';"

# Изменённая или удалённая уже существующая миграция — несовместимо при любых пометках.
git checkout -q --detach "$base"
printf -- '-- rollback-safe: правка\nCREATE TABLE "jobs" ("id" TEXT NOT NULL);\n' > "$dir/0_init/migration.sql"
git commit -qam 'modified migration'
verdict 'modified migration' 2
git checkout -q --detach "$base"
git rm -q "$dir/0_init/migration.sql" && git commit -qm 'deleted migration'
verdict 'deleted migration' 2

if [ "$failures" -gt 0 ]; then
  echo "$failures migration check case(s) failed"
  exit 1
fi
echo 'Migration check cases passed'
