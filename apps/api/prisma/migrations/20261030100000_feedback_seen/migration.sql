-- Автор видит, что поддержка ответила (docs/FEEDBACK.md): время, когда он открыл ответ.
-- Новый столбец допускает NULL — прежняя версия API его не замечает, откат безопасен.
ALTER TABLE "feedback" ADD COLUMN "author_seen_at" TIMESTAMP(3);
