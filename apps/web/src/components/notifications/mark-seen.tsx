'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { markJobSeenAction } from '@/app/(site)/account/notifications/actions';

/**
 * Отмечает уведомления заказа прочитанными, когда страница заказа на экране, и обновляет
 * страницу (число в шапке). Срабатывает снова, если пока страница открыта пришло новое (например,
 * сообщение при автообновлении переписки). Без JS уведомления отмечаются на странице уведомлений.
 */
export function MarkSeen({ jobId, unread }: { jobId: string; unread: number }) {
  const router = useRouter();
  useEffect(() => {
    if (unread === 0) return;
    let done = false;
    const mark = () => {
      if (done || document.visibilityState !== 'visible') return;
      done = true;
      markJobSeenAction(jobId).then(({ ok }) => {
        if (ok) router.refresh();
      });
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [jobId, unread, router]);
  return null;
}
