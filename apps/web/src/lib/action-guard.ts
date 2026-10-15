import 'server-only';
import { headers } from 'next/headers';
import { isSameOriginRequest, parsePublicOrigin } from './same-origin';

export const FOREIGN_ORIGIN = 'Запрос отклонён. Обновите страницу и попробуйте снова.';

/** Server Actions — публичные эндпоинты: источник проверяется в каждом из них. */
export async function isTrustedOrigin(): Promise<boolean> {
  const h = await headers();
  return isSameOriginRequest(
    (name) => h.get(name),
    parsePublicOrigin(process.env.WEB_PUBLIC_ORIGIN),
  );
}
