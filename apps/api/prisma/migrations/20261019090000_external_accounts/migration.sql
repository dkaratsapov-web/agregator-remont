-- Вход через банки (Сбер ID, Т-Банк ID): связь аккаунта с постоянным идентификатором человека
-- у банка. Токены банка не хранятся.
CREATE TYPE "ExternalProvider" AS ENUM ('SBER', 'TBANK');

CREATE TABLE "external_accounts" (
    "id" TEXT NOT NULL,
    "provider" "ExternalProvider" NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_accounts_provider_subject_key" ON "external_accounts"("provider", "subject");
CREATE UNIQUE INDEX "external_accounts_user_id_provider_key" ON "external_accounts"("user_id", "provider");

ALTER TABLE "external_accounts" ADD CONSTRAINT "external_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_accounts" ADD CONSTRAINT "external_accounts_subject_not_blank" CHECK (char_length(btrim("subject")) > 0);
