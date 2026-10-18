-- Несколько категорий в одном заказе: дополнительные позиции и список всех категорий.
ALTER TABLE "jobs" ADD COLUMN "extra_items" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "jobs" ADD COLUMN "categories" "JobCategory"[] NOT NULL DEFAULT ARRAY[]::"JobCategory"[];

-- Список категорий ведёт база: основная категория первой, затем категории позиций. Триггер
-- срабатывает на любую запись (API, сид, тесты), поэтому список не может разойтись с заказом.
CREATE FUNCTION "jobs_sync_categories"() RETURNS trigger AS $$
BEGIN
  NEW."categories" := ARRAY[NEW."category"] || ARRAY(
    SELECT (item ->> 'category')::"JobCategory"
    FROM jsonb_array_elements(NEW."extra_items") AS item
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "jobs_sync_categories"
  BEFORE INSERT OR UPDATE OF "category", "extra_items", "categories" ON "jobs"
  FOR EACH ROW EXECUTE FUNCTION "jobs_sync_categories"();

-- Существующие заказы: одна позиция (триггер заполнит список).
UPDATE "jobs" SET "extra_items" = '[]';

-- Позиции: массив до 4 элементов и не больше 64 КБ (каждая анкета до 8 КБ, остальное запас).
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_extra_items_array" CHECK (jsonb_typeof("extra_items") = 'array' AND jsonb_array_length("extra_items") <= 4);
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_extra_items_size" CHECK (octet_length("extra_items"::text) <= 65536);

CREATE INDEX "jobs_categories_idx" ON "jobs" USING GIN ("categories");

ALTER TABLE "job_drafts" ADD COLUMN "extra_items" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "job_drafts" ADD CONSTRAINT "job_drafts_extra_items_array" CHECK (jsonb_typeof("extra_items") = 'array' AND jsonb_array_length("extra_items") <= 4);
ALTER TABLE "job_drafts" ADD CONSTRAINT "job_drafts_extra_items_size" CHECK (octet_length("extra_items"::text) <= 65536);
