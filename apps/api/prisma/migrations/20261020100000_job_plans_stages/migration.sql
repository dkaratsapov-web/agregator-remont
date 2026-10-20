-- План работ по заказу и этапы (фаза 2, сделка без денег): packages/shared/src/plans.ts.
-- Только новые таблицы и типы: прежний API их не знает. Внешний ключ на jobs — ON DELETE
-- CASCADE, чтобы прежний код при удалении заказа не упёрся в план.

CREATE TYPE "PlanParty" AS ENUM ('OWNER', 'CONTRACTOR');
CREATE TYPE "JobPlanStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED');
CREATE TYPE "JobStageStatus" AS ENUM ('PLANNED', 'SUBMITTED', 'ACCEPTED', 'REWORK');

-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'PLAN_SAVED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'PLAN_AUTHOR_CHANGED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'PLAN_PROPOSED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'PLAN_APPROVED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'PLAN_RETURNED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'STAGE_SUBMITTED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'STAGE_ACCEPTED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'STAGE_REWORK';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'CONTRACTOR_QUIT';

CREATE TABLE "job_plans" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "author" "PlanParty" NOT NULL DEFAULT 'CONTRACTOR',
    "sequential" BOOLEAN NOT NULL DEFAULT true,
    "status" "JobPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "return_reason" TEXT,
    "proposed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "job_plans_version_check" CHECK ("version" >= 1),
    CONSTRAINT "job_plans_return_reason_check" CHECK (char_length("return_reason") <= 1000)
);

CREATE TABLE "job_stages" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "duration_days" INTEGER,
    "status" "JobStageStatus" NOT NULL DEFAULT 'PLANNED',
    "submit_comment" TEXT,
    "rework_comment" TEXT,
    "submitted_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_stages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "job_stages_position_check" CHECK ("position" BETWEEN 1 AND 10),
    CONSTRAINT "job_stages_duration_check" CHECK ("duration_days" IS NULL OR "duration_days" BETWEEN 1 AND 365),
    CONSTRAINT "job_stages_description_check" CHECK (char_length("description") <= 2000),
    CONSTRAINT "job_stages_comments_check" CHECK (
      char_length("submit_comment") <= 1000 AND char_length("rework_comment") <= 1000
    )
);

CREATE UNIQUE INDEX "job_plans_job_id_key" ON "job_plans"("job_id");
CREATE UNIQUE INDEX "job_stages_plan_id_position_key" ON "job_stages"("plan_id", "position");

ALTER TABLE "job_plans" ADD CONSTRAINT "job_plans_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_stages" ADD CONSTRAINT "job_stages_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "job_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
