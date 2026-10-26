'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * «Написать в поддержку» с адресом текущей страницы (?from=): так обращение сразу говорит, где
 * случилась ошибка. Адрес подставляется уже при отрисовке на сервере — работает и без JS.
 */
export function FeedbackLink({ className }: { className?: string }) {
  const path = usePathname();
  const from = path && path !== '/account/feedback' ? `?from=${encodeURIComponent(path)}` : '';
  return (
    <Link href={`/account/feedback${from}`} className={className}>
      Написать в поддержку
    </Link>
  );
}
