import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Избранное', robots: { index: false } };

export default function FavoritesPage() {
  return (
    <ComingSoon
      title="Избранное"
      next="/account/favorites"
      points={[
        'Заказы, к которым вы хотите вернуться позже.',
        'Мастера и бригады, которых вы отметили.',
      ]}
    />
  );
}
