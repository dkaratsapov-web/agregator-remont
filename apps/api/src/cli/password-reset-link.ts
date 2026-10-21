/**
 * Ссылка для нового пароля с сервера, без входа в админку (например, администратор сам забыл
 * пароль). Запуск на VPS — docs/ACCOUNTS.md:
 *   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml \
 *     run --rm --no-deps api node dist/cli/password-reset-link.js <email> [https://домен]
 * Печатает ссылку один раз; в базе только хеш. Прежние неиспользованные ссылки гаснут.
 */
import { PrismaClient } from '@prisma/client';
import { issuePasswordReset } from '../auth/password-reset';

async function main(): Promise<number> {
  const [emailArg, siteArg] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  if (!email) {
    console.error('Укажите email: node dist/cli/password-reset-link.js user@example.ru [https://домен]');
    return 2;
  }
  const prisma = new PrismaClient();
  try {
    const link = await prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<{ id: string; blocked_at: Date | null }[]>`
        SELECT id, blocked_at FROM users WHERE email = ${email} FOR UPDATE`;
      if (!user) return null;
      if (user.blocked_at) throw new Error('аккаунт заблокирован: сначала разблокируйте его');
      return issuePasswordReset(tx, user.id, null);
    });
    if (!link) {
      console.error(`Пользователь ${email} не найден`);
      return 1;
    }
    const site = (siteArg ?? '').replace(/\/+$/, '');
    console.log(`Ссылка для нового пароля (действует до ${link.expiresAt}, один раз):`);
    console.log(`${site}/reset/${link.token}`);
    if (!site) console.log('Добавьте в начало адрес сайта, например https://домен');
    return 0;
  } catch (error) {
    console.error(`Ошибка: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().then((code) => process.exit(code));
