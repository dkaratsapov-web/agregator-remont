-- Модерация (фаза 2): жалобы и действия администратора, packages/shared/src/moderation.ts.
-- Новые столбцы допускают NULL (прежний код их не заполняет и не читает), новая таблица жалоб
-- ссылается на заказы и пользователей с ON DELETE CASCADE / SET NULL.

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('JOB', 'MESSAGE', 'BID');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'FRAUD', 'ABUSE', 'FAKE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'REPORT_CREATED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'REPORT_RESOLVED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'CONTENT_HIDDEN';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'CONTENT_RESTORED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'USER_BLOCKED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'USER_UNBLOCKED';

-- AlterTable
ALTER TABLE "bids" ADD COLUMN     "hidden_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "job_messages" ADD COLUMN     "hidden_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "hidden_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "blocked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_type" "ReportTarget" NOT NULL,
    "target_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reports_comment_check" CHECK (char_length("comment") <= 1000),
    CONSTRAINT "reports_note_check" CHECK ("note" IS NULL OR char_length("note") <= 500),
    -- Разобранная жалоба — с решением и временем, открытая — без них.
    CONSTRAINT "reports_resolution_check" CHECK (("status" = 'OPEN') = ("resolved_at" IS NULL))
);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reports_reporter_id_created_at_idx" ON "reports"("reporter_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_job_id_idx" ON "reports"("job_id");

-- Одна открытая жалоба автора на один предмет: повтор, пока первая не разобрана, — та же жалоба.
CREATE UNIQUE INDEX "reports_open_key" ON "reports"("reporter_id", "target_type", "target_id") WHERE "status" = 'OPEN';

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
