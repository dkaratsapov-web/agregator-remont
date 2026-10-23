-- Обмен контактами в сделке по согласию сторон: новая таблица и два значения журнала. Прежний
-- API таблицу не знает и контактов сторон не показывает, поэтому откат безопасен.

-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'CONTACTS_SHARED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'CONTACTS_HIDDEN';

-- CreateTable
CREATE TABLE "contact_shares" (
    "bid_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_shares_pkey" PRIMARY KEY ("bid_id","user_id")
);

-- CreateIndex
CREATE INDEX "contact_shares_user_id_idx" ON "contact_shares"("user_id");

-- AddForeignKey
ALTER TABLE "contact_shares" ADD CONSTRAINT "contact_shares_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_shares" ADD CONSTRAINT "contact_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
