#!/usr/bin/env bash
# Замер запросов каталога (как их строит Prisma в JobsService.list): план и время, медиана из 5.
# Порядок: пустая база -> prisma migrate deploy -> psql -f scripts/perf/catalog-seed.sql -> этот скрипт.
# Итоги до и после индексов: docs/PERFORMANCE_REPORT.md.
DB="${PERF_DATABASE_URL:?укажите PERF_DATABASE_URL отдельной базы для замера}"
COLS='id, title, city, status, created_at'
ORDER='ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 0'
declare -A Q=(
  [1_search_common]="(title ILIKE '%паркет%' OR description ILIKE '%паркет%')"
  [2_search_rare]="(title ILIKE '%заказ 4242%' OR description ILIKE '%заказ 4242%')"
  [3_city]="city ILIKE 'Казань'"
  [4_open]="status = 'OPEN'"
  [5_open_city_search]="status = 'OPEN' AND city ILIKE 'Казань' AND (title ILIKE '%кровля%' OR description ILIKE '%кровля%')"
  [6_category]="categories @> ARRAY['TILING']::\"JobCategory\"[]"
)
for name in $(printf '%s\n' "${!Q[@]}" | sort); do
  for kind in page count; do
    if [ $kind = page ]; then sql="SELECT $COLS FROM jobs WHERE ${Q[$name]} $ORDER";
    else sql="SELECT count(*) FROM (SELECT id FROM jobs WHERE ${Q[$name]}) t"; fi
    times=(); plan=''
    for _ in 1 2 3 4 5; do
      out=$(psql "$DB" -XAtc "EXPLAIN (ANALYZE, FORMAT TEXT) $sql")
      times+=("$(grep -oP 'Execution Time: \K[0-9.]+' <<<"$out")")
      plan=$(grep -oE '(Seq Scan|Index Scan|Index Only Scan|Bitmap Index Scan|Bitmap Heap Scan|Parallel Seq Scan)[^(]*on [a-z_]+' <<<"$out" | sed 's/ using.*//' | sort -u | paste -sd ';')
    done
    med=$(printf '%s\n' "${times[@]}" | sort -n | sed -n 3p)
    printf '%-22s %-6s %8s ms  %s\n' "$name" "$kind" "$med" "$plan"
  done
done
