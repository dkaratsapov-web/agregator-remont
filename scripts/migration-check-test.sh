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
case_sql 'DROP CONSTRAINT' 2 'ALTER TABLE "jobs" DROP CONSTRAINT "jobs_pkey";'
case_sql 'RENAME TABLE' 2 'ALTER TABLE "jobs" RENAME TO "orders";'
# Новая таблица ссылается на существующую: без CASCADE / SET NULL прежний код не удалит заказ,
# на который появилась ссылка.
case_sql 'new table: foreign key to an existing table, RESTRICT' 2 'CREATE TABLE "notes" ("id" TEXT NOT NULL, "job_id" TEXT NOT NULL);
ALTER TABLE "notes" ADD CONSTRAINT "notes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;'
case_sql 'new table: foreign key without ON DELETE' 2 'CREATE TABLE "notes" ("id" TEXT NOT NULL, "job_id" TEXT REFERENCES "jobs"("id"));'
case_sql 'new table: foreign key with SET NULL' 0 'CREATE TABLE "notes" ("id" TEXT NOT NULL, "job_id" TEXT);
ALTER TABLE "notes" ADD CONSTRAINT "notes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;'
# Лазейки белого списка (ревью garantych-reviewer): «новая» таблица с именем существующей
# (IF NOT EXISTS, другая схема, другой регистр) не делает её изменения безопасными; внешний
# ключ без списка столбцов и встроенный в ADD COLUMN существующей таблицы тоже ловится.
case_sql 'CREATE TABLE IF NOT EXISTS of an existing table, then DROP COLUMN' 2 'CREATE TABLE IF NOT EXISTS "jobs" ("id" TEXT);
ALTER TABLE "jobs" DROP COLUMN "title";'
case_sql 'table of the same name in another schema, then DROP COLUMN' 2 'CREATE TABLE "audit"."jobs" ("id" TEXT);
ALTER TABLE "jobs" DROP COLUMN "title";'
case_sql 'quoted table of another case, then DROP COLUMN' 2 'CREATE TABLE "Jobs" ("id" TEXT);
ALTER TABLE "jobs" DROP COLUMN "title";'
case_sql 'new table: foreign key without a column list' 2 'CREATE TABLE "notes" ("id" TEXT NOT NULL, "job_id" TEXT REFERENCES "jobs");'
case_sql 'existing table: new column with a foreign key' 2 'ALTER TABLE "jobs" ADD COLUMN "parent_id" TEXT REFERENCES "jobs"("id");'
case_sql 'existing table: new column with a foreign key ON DELETE SET NULL' 0 'ALTER TABLE "jobs" ADD COLUMN "parent_id" TEXT REFERENCES "jobs"("id") ON DELETE SET NULL;'
case_sql 'new table in another case is still new: its foreign key and index are fine' 0 'CREATE TABLE "Notes" ("id" TEXT NOT NULL, "job_id" TEXT);
ALTER TABLE "Notes" ADD CONSTRAINT "notes_job_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "notes_job_key" ON "Notes"("job_id");'

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
# shellcheck disable=SC2016 # $body$ — SQL, а не переменная shell
case_sql 'semicolon inside a dollar-quoted string is not a statement end' 0 'COMMENT ON TABLE "jobs" IS $body$a; DROP TABLE "jobs"$body$;'
case_sql 'dangerous words in comments and strings are not operations' 0 "/* DROP TABLE \"jobs\"; */
-- ALTER TABLE \"jobs\" DROP COLUMN \"title\";
UPDATE \"jobs\" SET \"title\" = 'x; DROP TABLE y' WHERE \"id\" = '1';"
# Строки и $-кавычки по правилам Postgres (ТЗ #42): разбор не должен «проглотить» опасный
# оператор, который Postgres выполнит. E'…' — с экранированием обратной косой чертой.
case_sql "E-string with an escaped quote does not hide a DROP" 2 "UPDATE \"jobs\" SET \"title\" = E'a\\'' WHERE \"id\" = '1';
DROP TABLE \"jobs\";
SELECT '';"
case_sql "escaped backslash at the end of an E-string" 2 "UPDATE \"jobs\" SET \"title\" = E'a\\\\';
DROP TABLE \"jobs\";"
case_sql "doubled quote in an ordinary string is still one string" 0 "UPDATE \"jobs\" SET \"title\" = 'it''s; DROP TABLE y' WHERE \"id\" = '1';"
# shellcheck disable=SC2016 # $a1$ — SQL, а не переменная shell
case_sql 'dollar tag with digits does not hide a DROP' 2 'COMMENT ON TABLE "jobs" IS $a1$'"'"'$a1$;
DROP TABLE "jobs";
SELECT '"'"'x'"'"';'
# shellcheck disable=SC2016
case_sql '$ inside an identifier is not a dollar quote' 2 'CREATE TABLE "n" (a$x$ INTEGER);
UPDATE "n" SET a$x$ = 1;
DROP TABLE "jobs";
UPDATE "n" SET a$x$ = 2;'
# shellcheck disable=SC2016
case_sql 'semicolon inside a dollar tag with digits' 0 'COMMENT ON TABLE "jobs" IS $a1$a; DROP TABLE "jobs"$a1$;'

# Таблица, созданная внутри диапазона, неизвестна целевой версии: с ней можно всё. Если же
# целевая версия её уже знает (создана до цели), удаление столбца опасно.
git checkout -q --detach "$base"
mkdir -p "$dir/1_notes"
printf 'CREATE TABLE "notes" ("id" TEXT NOT NULL, "text" TEXT);\n' > "$dir/1_notes/migration.sql"
git add -A && git commit -qm 'create notes'
with_notes=$(git rev-parse HEAD)
mkdir -p "$dir/2_notes"
printf 'ALTER TABLE "notes" DROP COLUMN "text";\n' > "$dir/2_notes/migration.sql"
git add -A && git commit -qm 'drop notes column'
verdict 'table created in the range: the target does not know it' 0
base_saved=$base base=$with_notes
verdict 'table created before the target: dropping its column is dangerous' 2
base=$base_saved

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
