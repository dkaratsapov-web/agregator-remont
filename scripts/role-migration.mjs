// Миграция, меняющая роль одного аккаунта по известному userId (docs/SECURITY.md, раздел 10):
//   node scripts/role-migration.mjs <userId> <ADMIN|CUSTOMER|CONTRACTOR> "<причина>"
// Создаёт apps/api/prisma/migrations/<время>_role_<роль>_<userId>/migration.sql. Миграция идёт
// через PR и аудит, применяется автодеплоем и пишет запись USER_ROLE_CHANGED в журнал аудита.
// Если аккаунта нет или роль уже такая, ничего не меняет (без ошибки: упавшая миграция
// остановила бы автодеплой).
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const ROLES = ['ADMIN', 'CUSTOMER', 'CONTRACTOR'];
const [userId, role, reason] = process.argv.slice(2);

if (!/^c[a-z0-9]{20,32}$/.test(userId ?? '') || !ROLES.includes(role) || !reason?.trim()) {
  console.error(
    'usage: node scripts/role-migration.mjs <userId> <ADMIN|CUSTOMER|CONTRACTOR> "<причина>"',
  );
  process.exit(1);
}
if (/[\r\n*]/.test(reason) || reason.length > 200) {
  console.error('reason: одна строка до 200 символов, без *');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const dir = `apps/api/prisma/migrations/${stamp}_role_${role.toLowerCase()}_${userId}`;
const auditId = `role${randomBytes(10).toString('hex')}`;

const sql = `/* ${reason.trim()} */
-- Роль ${role} для аккаунта ${userId}. Сначала запись в журнал аудита (со старой ролью), затем
-- смена роли; если аккаунта нет или роль уже ${role}, ничего не меняется.
INSERT INTO "audit_logs" ("id", "actor_id", "action", "entity_type", "entity_id", "changes")
SELECT '${auditId}', NULL, 'USER_ROLE_CHANGED', 'user', "id",
       jsonb_build_object('role', jsonb_build_object('from', "role"::text, 'to', '${role}'))
FROM "users"
WHERE "id" = '${userId}' AND "role" <> '${role}';

UPDATE "users" SET "role" = '${role}', "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '${userId}' AND "role" <> '${role}';
`;

mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/migration.sql`, sql);
console.log(`${dir}/migration.sql`);
