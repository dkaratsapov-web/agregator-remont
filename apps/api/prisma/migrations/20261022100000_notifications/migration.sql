-- Уведомления в кабинете (фаза 2): packages/shared/src/notifications.ts.
-- Только новые тип и таблица: прежний API их не знает. Внешние ключи — ON DELETE CASCADE, чтобы
-- прежний код при удалении заказа или пользователя не упёрся в новые строки.

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('BID_RECEIVED', 'BID_WITHDRAWN', 'BID_ACCEPTED', 'BID_REJECTED', 'PLAN_PROPOSED', 'PLAN_APPROVED', 'PLAN_RETURNED', 'PLAN_AUTHOR_CHANGED', 'STAGE_SUBMITTED', 'STAGE_ACCEPTED', 'STAGE_REWORK', 'CONTRACTOR_QUIT', 'JOB_CLOSED', 'MESSAGE');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_count_check" CHECK ("count" BETWEEN 1 AND 10000),
    CONSTRAINT "notifications_data_check" CHECK (jsonb_typeof("data") = 'object' AND octet_length("data"::text) <= 1024)
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_id_idx" ON "notifications"("user_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notifications_job_id_idx" ON "notifications"("job_id");

-- Счётчик непрочитанного и сводка по заказам читают только непрочитанные строки.
CREATE INDEX "notifications_unread_idx" ON "notifications"("user_id", "job_id") WHERE "read_at" IS NULL;

-- Новые сообщения по заказу собираются в одну непрочитанную строку (INSERT … ON CONFLICT).
CREATE UNIQUE INDEX "notifications_message_unread_key" ON "notifications"("user_id", "job_id") WHERE "kind" = 'MESSAGE' AND "read_at" IS NULL;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
