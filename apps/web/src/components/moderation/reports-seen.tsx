'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { markReportsSeenAction } from '@/app/(site)/account/reports/actions';

/** Решения по жалобам на экране — просмотрены: число в шапке обновляется. */
export function ReportsSeen({ unseen }: { unseen: number }) {
  const router = useRouter();
  useEffect(() => {
    if (unseen === 0) return;
    let done = false;
    const mark = () => {
      if (done || document.visibilityState !== 'visible') return;
      done = true;
      markReportsSeenAction().then(({ ok }) => {
        if (ok) router.refresh();
      });
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [unseen, router]);
  return null;
}
