-- Журнал аудита: смена роли пользователя (назначение администратора миграцией, docs/SECURITY.md, раздел 10).
ALTER TYPE "AuditAction" ADD VALUE 'USER_ROLE_CHANGED';
