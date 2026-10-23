-- Аккаунты и доверие (фаза 2): сброс пароля по одноразовой ссылке, отзывы об исполнителе,
-- избранные заказы, автопроверка контактов в тексте, отметка «решение по жалобе просмотрено».
-- Только новые таблицы и один столбец, допускающий NULL: прежний API их не знает. Внешние ключи
-- новых таблиц — ON DELETE CASCADE / SET NULL. Новые виды уведомлений намеренно не добавлены:
-- прежний API не прочитал бы строки с неизвестным значением enum (проверено на Prisma 6).

-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RESET_ISSUED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RESET_DONE';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'REVIEW_CREATED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'FLAG_RESOLVED';

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "reporter_seen_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "issued_by_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "password_resets_expiry_check" CHECK ("expires_at" > "created_at")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "contractor_id" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "hidden_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "reviews_text_check" CHECK (char_length("text") <= 1000),
    CONSTRAINT "reviews_author_check" CHECK ("author_id" <> "contractor_id")
);

-- CreateTable
CREATE TABLE "favorite_jobs" (
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_jobs_pkey" PRIMARY KEY ("user_id","job_id")
);

-- CreateTable
CREATE TABLE "content_flags" (
    "id" TEXT NOT NULL,
    "target_type" "ReportTarget" NOT NULL,
    "target_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "kinds" VARCHAR(64) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_flags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_flags_target_check" CHECK ("target_type" IN ('MESSAGE', 'BID')),
    CONSTRAINT "content_flags_kinds_check" CHECK ("kinds" ~ '^(PHONE|EMAIL|LINK|MESSENGER)(,(PHONE|EMAIL|LINK|MESSENGER))*$'),
    -- Разобранная пометка — с временем решения, открытая — без него.
    CONSTRAINT "content_flags_resolution_check" CHECK (("status" = 'OPEN') = ("resolved_at" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_hash_key" ON "password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_job_id_key" ON "reviews"("job_id");

-- CreateIndex
CREATE INDEX "reviews_contractor_id_created_at_idx" ON "reviews"("contractor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "favorite_jobs_user_id_created_at_idx" ON "favorite_jobs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "content_flags_status_created_at_idx" ON "content_flags"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_flags_target_type_target_id_key" ON "content_flags"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_jobs" ADD CONSTRAINT "favorite_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_jobs" ADD CONSTRAINT "favorite_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Блокировка на уровне базы: заблокированному аккаунту новый сеанс не создаётся, какой бы версии
-- ни был API. Так блокировка действует и после отката на версию, которая о ней не знает
-- (docs/MODERATION.md, «Откат»). Текущий API проверяет блокировку раньше и сюда не доходит.
-- rollback-safe: новая функция, прежний API её не вызывает
CREATE FUNCTION "refuse_session_for_blocked_user"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "id" = NEW."user_id" AND "blocked_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'user is blocked' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- rollback-safe: прежний API создаёт сеансы только при входе и регистрации; заблокированному он отказать не умеет — отказывает база
CREATE TRIGGER "sessions_refuse_blocked_user" BEFORE INSERT ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION "refuse_session_for_blocked_user"();
