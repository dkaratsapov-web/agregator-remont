-- Исход закрытия заказа и причина отклонения отклика (AUDIT_FINDINGS MVP-5).
CREATE TYPE "JobCloseOutcome" AS ENUM ('COMPLETED', 'CANCELLED');
CREATE TYPE "BidRejectReason" AS ENUM ('OTHER_ACCEPTED', 'JOB_CLOSED');

ALTER TABLE "jobs" ADD COLUMN "close_outcome" "JobCloseOutcome";
ALTER TABLE "bids" ADD COLUMN "reject_reason" "BidRejectReason";

-- Уже закрытые заказы: исход неизвестен (NULL). Отклонённые отклики восстанавливаются по
-- данным: если у заказа есть выбранный исполнитель — выбран другой, иначе заказ закрыт.
UPDATE "bids" AS b SET "reject_reason" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "bids" a WHERE a."job_id" = b."job_id" AND a."status" = 'ACCEPTED'
    ) THEN 'OTHER_ACCEPTED'::"BidRejectReason"
    ELSE 'JOB_CLOSED'::"BidRejectReason"
  END
WHERE b."status" = 'REJECTED';
