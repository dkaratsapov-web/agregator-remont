import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Корзина', robots: { index: false } };

export default function CartPage() {
  return (
    <ComingSoon
      title="Корзина"
      next="/account/cart"
      points={[
        'Материалы для ремонта с доставкой на объект.',
        'Заказ материалов под конкретный этап работ.',
      ]}
    />
  );
}
