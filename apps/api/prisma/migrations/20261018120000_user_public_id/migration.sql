-- Короткий номер аккаунта для поддержки («ID 100245»), начиная с 100001. Существующие
-- пользователи получают номера в порядке регистрации, новые — следующие по счёту.
-- Итог эквивалентен SERIAL, который ждёт Prisma (@default(autoincrement())).
CREATE SEQUENCE "users_public_id_seq" AS INTEGER START WITH 100001;

ALTER TABLE "users" ADD COLUMN "public_id" INTEGER;

UPDATE "users" AS u
SET "public_id" = n.num
FROM (
  SELECT "id", 100000 + row_number() OVER (ORDER BY "created_at", "id") AS num FROM "users"
) AS n
WHERE u."id" = n."id";

-- Следующий номер после последнего выданного (или 100001, если пользователей нет).
SELECT setval('"users_public_id_seq"', COALESCE(MAX("public_id"), 100001), MAX("public_id") IS NOT NULL)
FROM "users";

ALTER TABLE "users"
  ALTER COLUMN "public_id" SET DEFAULT nextval('"users_public_id_seq"'),
  ALTER COLUMN "public_id" SET NOT NULL;

ALTER SEQUENCE "users_public_id_seq" OWNED BY "users"."public_id";

CREATE UNIQUE INDEX "users_public_id_key" ON "users"("public_id");
