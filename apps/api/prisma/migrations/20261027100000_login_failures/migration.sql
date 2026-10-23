-- Защита от перебора пароля к одному адресу: серия неверных попыток по хешу адреса. Новая
-- таблица: прежний API её не знает, откат безопасен (защита на время отката не действует,
-- лимит по IP остаётся).

-- CreateTable
CREATE TABLE "login_failures" (
    "email_hash" VARCHAR(64) NOT NULL,
    "failures" INTEGER NOT NULL,
    "last_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_failures_pkey" PRIMARY KEY ("email_hash"),
    CONSTRAINT "login_failures_failures_check" CHECK ("failures" > 0),
    CONSTRAINT "login_failures_hash_check" CHECK ("email_hash" ~ '^[0-9a-f]{64}$')
);

-- CreateIndex
CREATE INDEX "login_failures_last_at_idx" ON "login_failures"("last_at");
