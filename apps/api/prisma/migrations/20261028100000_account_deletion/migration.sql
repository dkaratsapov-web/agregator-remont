-- Удаление аккаунта по просьбе пользователя (152-ФЗ): строка пользователя остаётся (на неё
-- ссылаются заказы, отклики и переписка других людей), но личные данные стираются, а время
-- удаления записывается сюда. Удалённый аккаунт заодно заблокирован (blocked_at): прежний API
-- после отката не пустит в него и не создаст ему сессию (триггер sessions_refuse_blocked_user).
-- Новый столбец допускает NULL: прежний API его не знает, откат безопасен.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterEnum
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_DELETED';
-- rollback-safe: API журнал только пишет и не читает; прежний код новых значений не встречает
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_EXPORTED';
