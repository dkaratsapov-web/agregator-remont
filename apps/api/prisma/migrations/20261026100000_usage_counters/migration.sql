-- Аналитика без персональных данных: счётчики по дням (без людей, адресов, cookie) и индекс
-- журнала для подсчёта шагов воронки. Новая таблица и индекс: прежний API их не знает, откат
-- безопасен.

-- CreateTable
CREATE TABLE "usage_counters" (
    "day" DATE NOT NULL,
    "metric" VARCHAR(40) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("day","metric"),
    CONSTRAINT "usage_counters_count_check" CHECK ("count" >= 0),
    CONSTRAINT "usage_counters_metric_check" CHECK ("metric" ~ '^[A-Z_]{1,40}$')
);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
