-- Переписка по заказу и фото к сообщениям и сдаче этапов (фаза 2): packages/shared/src/messages.ts.
-- Только новые таблицы: прежний API их не знает. Все внешние ключи — ON DELETE CASCADE, чтобы
-- прежний код при удалении заказа, этапа или пользователя не упёрся в новые строки.
-- Байты фото — в отдельной таблице и попадают в pg_dump вместе с остальными данными.

-- CreateTable
CREATE TABLE "job_messages" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "job_messages_body_check" CHECK (char_length("body") <= 2000)
);

-- CreateTable
CREATE TABLE "job_photos" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "stage_id" TEXT,
    "message_id" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_photos_pkey" PRIMARY KEY ("id"),
    -- Фото принадлежит ровно одному: сообщению или сдаче этапа.
    CONSTRAINT "job_photos_owner_check" CHECK (("stage_id" IS NULL) <> ("message_id" IS NULL)),
    CONSTRAINT "job_photos_size_check" CHECK ("width" BETWEEN 1 AND 2000 AND "height" BETWEEN 1 AND 2000 AND "bytes" > 0)
);

-- CreateTable
CREATE TABLE "job_photo_blobs" (
    "photo_id" TEXT NOT NULL,
    "full" BYTEA NOT NULL,
    "thumb" BYTEA NOT NULL,

    CONSTRAINT "job_photo_blobs_pkey" PRIMARY KEY ("photo_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_messages_author_id_request_id_key" ON "job_messages"("author_id", "request_id");

-- CreateIndex
CREATE INDEX "job_messages_job_id_contractor_id_created_at_idx" ON "job_messages"("job_id", "contractor_id", "created_at");

-- CreateIndex
CREATE INDEX "job_photos_stage_id_idx" ON "job_photos"("stage_id");

-- CreateIndex
CREATE INDEX "job_photos_message_id_idx" ON "job_photos"("message_id");

-- CreateIndex
CREATE INDEX "job_photos_job_id_idx" ON "job_photos"("job_id");

-- AddForeignKey
ALTER TABLE "job_messages" ADD CONSTRAINT "job_messages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_messages" ADD CONSTRAINT "job_messages_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_messages" ADD CONSTRAINT "job_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "job_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "job_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photo_blobs" ADD CONSTRAINT "job_photo_blobs_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "job_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
