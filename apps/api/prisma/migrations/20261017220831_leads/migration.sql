-- Заявки на участие в закрытом тестировании (форма на главной) и действия администратора.

-- AlterEnum

ALTER TYPE "AuditAction" ADD VALUE 'LEAD_PROCESSED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAD_REOPENED';

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(12) NOT NULL,
    "consent_version" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_phone_created_at_idx" ON "leads"("phone", "created_at");

-- Формат телефона проверяется и в API, и в базе.
ALTER TABLE "leads" ADD CONSTRAINT "leads_phone_format" CHECK ("phone" ~ '^\+7[3489][0-9]{9}$');
