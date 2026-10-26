-- Обратная связь участников закрытого тестирования (docs/FEEDBACK.md): ошибка, идея или вопрос
-- из кабинета и ответ администратора. Новая таблица и новый тип: прежний API их не знает, откат
-- безопасен; внешние ключи на users — с ON DELETE CASCADE / SET NULL.

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('BUG', 'IDEA', 'QUESTION');

-- AlterEnum
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'FEEDBACK_REPLIED';

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "body" TEXT NOT NULL,
    "page" VARCHAR(200),
    "reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "replied_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feedback_body_check" CHECK (char_length("body") BETWEEN 10 AND 2000),
    CONSTRAINT "feedback_page_check" CHECK ("page" IS NULL OR "page" ~ '^/[^\s]*$'),
    CONSTRAINT "feedback_reply_check" CHECK (
      ("reply" IS NULL AND "replied_at" IS NULL)
      OR ("reply" IS NOT NULL AND "replied_at" IS NOT NULL AND char_length("reply") BETWEEN 2 AND 2000)
    )
);

-- CreateIndex
CREATE INDEX "feedback_user_id_created_at_idx" ON "feedback"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "feedback_replied_at_created_at_idx" ON "feedback"("replied_at", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_replied_by_id_fkey" FOREIGN KEY ("replied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

