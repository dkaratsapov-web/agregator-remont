-- CreateEnum
CREATE TYPE "JobCategory" AS ENUM ('REPAIR_TURNKEY', 'PLUMBING', 'ELECTRICAL', 'TILING', 'FINISHING', 'FLOORING', 'ROOFING', 'WINDOWS_DOORS', 'DESIGN', 'OTHER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('RUB');

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "JobCategory" NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "budget_min" INTEGER,
    "budget_max" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'RUB',
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_created_at_id_idx" ON "jobs"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "jobs_category_created_at_idx" ON "jobs"("category", "created_at" DESC);

-- Целостность бюджета (Prisma не описывает CHECK в схеме)
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_budget_min_non_negative" CHECK ("budget_min" IS NULL OR "budget_min" >= 0);
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_budget_max_non_negative" CHECK ("budget_max" IS NULL OR "budget_max" >= 0);
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_budget_range_valid" CHECK ("budget_min" IS NULL OR "budget_max" IS NULL OR "budget_min" <= "budget_max");
