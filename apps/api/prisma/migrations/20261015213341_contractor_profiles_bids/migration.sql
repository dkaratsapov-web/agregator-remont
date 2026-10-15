-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'JOB_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'BID_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'BID_WITHDRAWN';
ALTER TYPE "AuditAction" ADD VALUE 'BID_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE 'BID_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'PROFILE_UPDATED';

-- CreateTable
CREATE TABLE "contractor_profiles" (
    "user_id" TEXT NOT NULL,
    "about" TEXT NOT NULL DEFAULT '',
    "categories" "JobCategory"[],
    "cities" TEXT[],
    "experience_years" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "duration_days" INTEGER,
    "comment" TEXT NOT NULL,
    "status" "BidStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bids_contractor_id_created_at_idx" ON "bids"("contractor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "bids_job_id_status_idx" ON "bids"("job_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bids_job_id_contractor_id_key" ON "bids"("job_id", "contractor_id");

-- AddForeignKey
ALTER TABLE "contractor_profiles" ADD CONSTRAINT "contractor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ограничения значений (дублируют проверки API на уровне БД).
ALTER TABLE "bids" ADD CONSTRAINT "bids_price_range" CHECK ("price" >= 0 AND "price" <= 1000000000);
ALTER TABLE "bids" ADD CONSTRAINT "bids_duration_range" CHECK ("duration_days" IS NULL OR ("duration_days" >= 1 AND "duration_days" <= 365));
ALTER TABLE "contractor_profiles" ADD CONSTRAINT "contractor_profiles_experience_range" CHECK ("experience_years" IS NULL OR ("experience_years" >= 0 AND "experience_years" <= 70));
-- Не больше одного выбранного исполнителя на заказ.
CREATE UNIQUE INDEX "bids_one_accepted_per_job" ON "bids"("job_id") WHERE "status" = 'ACCEPTED';
