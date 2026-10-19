-- Индексы поиска каталога (AUDIT_FINDINGS ARCH-2, ARCH-7). Prisma не описывает trigram- и
-- частичные индексы в schema.prisma: они живут только здесь (см. scripts/check-schema-drift.sh).
-- Замер на 100 тыс. заказов до и после: docs/PERFORMANCE_REPORT.md.

-- Поиск ILIKE '%…%' по названию и описанию и город без учёта регистра (ILIKE без шаблона).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "jobs_title_trgm_idx" ON "jobs" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "jobs_description_trgm_idx" ON "jobs" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "jobs_city_trgm_idx" ON "jobs" USING GIN ("city" gin_trgm_ops);

-- «Только открытые» в каталоге: свежие открытые заказы без прохода по закрытым.
CREATE INDEX "jobs_open_created_at_idx" ON "jobs" ("created_at" DESC, "id" DESC)
  WHERE "status" = 'OPEN';

-- Ни один запрос не фильтрует по основной категории: каталог ищет по всем категориям заказа
-- (GIN jobs_categories_idx).
DROP INDEX "jobs_category_created_at_idx";
