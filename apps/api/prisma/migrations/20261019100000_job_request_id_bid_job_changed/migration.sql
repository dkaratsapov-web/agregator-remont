-- Идемпотентная публикация заказа: ключ формы (UUID), уникальный в пределах владельца
-- (AUDIT_FINDINGS MVP-1). NULL у старых заказов и у публикаций без ключа.
ALTER TABLE "jobs" ADD COLUMN "request_id" UUID;
CREATE UNIQUE INDEX "jobs_owner_id_request_id_key" ON "jobs"("owner_id", "request_id");

-- Пометка отклика «заказ изменён после вашего отклика» (MVP-3).
ALTER TABLE "bids" ADD COLUMN "job_changed_at" TIMESTAMP(3);
