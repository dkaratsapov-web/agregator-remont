-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'SESSIONS_REVOKED';

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "device" VARCHAR(80),
ADD COLUMN     "last_seen_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_updated_at" TIMESTAMP(3),
ADD COLUMN     "city" VARCHAR(80),
ADD COLUMN     "phone" VARCHAR(12),
ADD COLUMN     "ui_motion" VARCHAR(10) NOT NULL DEFAULT 'system',
ADD COLUMN     "ui_scale" VARCHAR(10) NOT NULL DEFAULT 'normal',
ADD COLUMN     "ui_theme" VARCHAR(10) NOT NULL DEFAULT 'light';

-- CreateTable
CREATE TABLE "user_avatars" (
    "user_id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Значения, которые нельзя записать в обход API.
ALTER TABLE "users" ADD CONSTRAINT "users_phone_format" CHECK ("phone" IS NULL OR "phone" ~ '^\+7[3489][0-9]{9}$');
ALTER TABLE "users" ADD CONSTRAINT "users_ui_theme" CHECK ("ui_theme" IN ('light', 'dark', 'system'));
ALTER TABLE "users" ADD CONSTRAINT "users_ui_scale" CHECK ("ui_scale" IN ('compact', 'normal', 'large'));
ALTER TABLE "users" ADD CONSTRAINT "users_ui_motion" CHECK ("ui_motion" IN ('system', 'reduced'));
-- Фото не больше 512 КБ после перекодирования (защита базы, обычно 20-60 КБ).
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_size" CHECK (octet_length("data") <= 524288);
