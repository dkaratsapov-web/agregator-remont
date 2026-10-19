#!/usr/bin/env bash
# Совместимость миграций со старым кодом: bash deploy/autodeploy/migration-check.sh <от> <до>
# Смотрит миграции, добавленные между двумя коммитами (apps/api/prisma/migrations), и ищет
# операции, после которых прежняя версия API может сломаться: удаление таблицы, столбца или
# типа, переименование, смена типа столбца, SET NOT NULL, NOT NULL без DEFAULT, новое значение
# enum. Такая операция допустима только с пометкой в файле миграции:
#   -- rollback-safe: <почему прежний код с ней работает>
# Код выхода: 0 — совместимо, 2 — есть непомеченные опасные операции (список в выводе).
# Используют rollback.sh (откат на старые образы поверх новой схемы) и CI (новые миграции PR).
set -euo pipefail

from=${1:?укажите коммит «от»}
to=${2:?укажите коммит «до»}
dir=apps/api/prisma/migrations
pattern='drop[[:space:]]+(table|column|type)|rename[[:space:]]+(to|column)|alter[[:space:]]+column[^;]*[[:space:]]type[[:space:]]|set[[:space:]]+not[[:space:]]+null|add[[:space:]]+value|add[[:space:]]+column[^;]*not[[:space:]]+null'

found=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  sql=$(git show "$to:$file")
  if grep -qi '^--[[:space:]]*rollback-safe:' <<< "$sql"; then
    echo "миграция $file: опасные операции помечены rollback-safe"
    continue
  fi
  # NOT NULL с DEFAULT для нового столбца безопасен: старый код его не заполняет.
  hits=$(grep -Ein "$pattern" <<< "$sql" | grep -Eiv 'add[[:space:]]+column[^;]*default' || true)
  if [ -n "$hits" ]; then
    found=1
    echo "НЕСОВМЕСТИМО: $file"
    while IFS= read -r hit; do echo "  строка $hit"; done <<< "$hits"
  else
    echo "миграция $file: только добавления, прежний код совместим"
  fi
done < <(git diff --name-only --diff-filter=A "$from" "$to" -- "$dir/*/migration.sql")

if [ "$found" -ne 0 ]; then
  echo 'Есть операции, с которыми прежняя версия API может не работать. Либо разделите миграцию'
  echo '(сначала добавить, потом убрать — deploy/README.md), либо, если прежний код точно не'
  echo 'затронут, добавьте в файл строку «-- rollback-safe: <причина>».'
  exit 2
fi
