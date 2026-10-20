'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Новые сообщения без перезагрузки: раз в 20 с страница перечитывает данные с сервера, пока
 * вкладка видна. Введённый текст и выбранные фото не сбрасываются (поля — клиентские).
 */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(tick, seconds * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router, seconds]);
  return null;
}
