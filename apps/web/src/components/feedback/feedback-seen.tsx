'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { markFeedbackSeenAction } from '@/app/(site)/account/feedback/actions';

/** Ответы поддержки на экране — просмотрены: число в шапке обновляется (как ReportsSeen). */
export function FeedbackSeen({ unseen }: { unseen: number }) {
  const router = useRouter();
  useEffect(() => {
    if (unseen === 0) return;
    let done = false;
    const mark = () => {
      if (done || document.visibilityState !== 'visible') return;
      done = true;
      markFeedbackSeenAction().then(({ ok }) => {
        if (ok) router.refresh();
      });
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [unseen, router]);
  return null;
}
