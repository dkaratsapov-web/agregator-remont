import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Чаты', robots: { index: false } };

export default function ChatsPage() {
  return (
    <ComingSoon
      title="Чаты"
      next="/account/chats"
      points={['Переписка заказчика и мастера по каждому заказу.', 'Фото-отчёты по этапам работ.']}
    />
  );
}
