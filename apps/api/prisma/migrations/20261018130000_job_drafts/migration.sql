-- Черновики нового заказа (видны только владельцу, в каталог не попадают).
CREATE TABLE "job_drafts" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" VARCHAR(160),
    "description" TEXT,
    "category" "JobCategory",
    "city" VARCHAR(100),
    "budget_min" INTEGER,
    "budget_max" INTEGER,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_drafts_owner_id_updated_at_idx" ON "job_drafts"("owner_id", "updated_at" DESC);

ALTER TABLE "job_drafts" ADD CONSTRAINT "job_drafts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Те же пределы, что у заказов: описание до 5000 символов, бюджет от 0 до 1 млрд,
-- ответы анкеты — объект не больше 16 КБ (API хранит до 8 КБ).
ALTER TABLE "job_drafts" ADD CONSTRAINT "job_drafts_description_length" CHECK ("description" IS NULL OR char_length("description") <= 5000);
ALTER TABLE "job_drafts" ADD CONSTRAINT "job_drafts_budget_min_range" CHECK ("budget_min" IS NULL OR "budget_min" BETWEEN 0 AND 1000000000);
ALTER TABLE "job_drafts" ADD CONSTRAINT "job_drafts_budget_max_range" CHECK ("budget_max" IS NULL OR "budget_max" BETWEEN 0 AND 1000000000);
ALTER TABLE "job_drafts" ADD CONSTRAINT "job_drafts_details_object" CHECK (jsonb_typeof("details") = 'object');
ALTER TABLE "job_drafts" ADD CONSTRAINT "job_drafts_details_size" CHECK (octet_length("details"::text) <= 16384);
