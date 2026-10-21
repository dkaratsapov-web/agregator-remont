/**
 * Ссылка для нового пароля с сервера, без входа в админку (например, администратор сам забыл
 * пароль). Запуск на VPS — docs/ACCOUNTS.md:
 *   docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.proxy.yml \
 *     run --rm --no-deps api node dist/cli/password-reset-link.js <email> [https://домен]
 * Печатает ссылку один раз и только в терминал (не в файл, journald или CI — иначе отказ, обход
 * --allow-non-tty); в базе только хеш. Прежние неиспользованные ссылки гаснут.
 */
import { PrismaClient } from '@prisma/client';
import { issuePasswordReset } from '../auth/password-reset';
import { ALLOW_NON_TTY, linkOutputAllowed, positional } from './reset-link-output';

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  // Ссылка — секрет: только в живой терминал, не в файл, journald или CI (docs/ACCOUNTS.md).
  if (!linkOutputAllowed(process.stdout.isTTY, args)) {
    console.error(
      `Вывод не в терминал: ссылка сохранилась бы в файле или журнале. Запустите в терминале (docker compose run выделяет его сам) или, если понимаете риск, добавьте ${ALLOW_NON_TTY}.`,
    );
    return 2;
  }
  const [emailArg, siteArg] = positional(args);
  const email = emailArg?.trim().toLowerCase();
  if (!email) {
    console.error(
      'Укажите email: node dist/cli/password-reset-link.js user@example.ru [https://домен]',
    );
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
    console.log(
      `Ссылка для нового пароля (действует до ${link.expiresAt}, один раз). Это секрет: передайте только владельцу аккаунта лично или в личном сообщении, не публикуйте и не вставляйте в задачи и чаты команды:`,
    );
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
