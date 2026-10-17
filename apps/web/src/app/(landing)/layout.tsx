import type { Metadata } from 'next';
import { MotionProvider } from '@/components/landing/motion-provider';
import './landing.css';

export const metadata: Metadata = {
  title: { absolute: 'Гарантыч: честный ремонт без лишнего риска' },
  description:
    'Мы соединяем заказчиков ремонта с мастерами и бригадами: заказ с бюджетом, отклики с ценой и сроком, выбор исполнителя.',
  openGraph: {
    title: 'Гарантыч: честный ремонт без лишнего риска',
    description: 'Заказ с бюджетом, отклики мастеров с ценой и сроком, выбор исполнителя.',
    locale: 'ru_RU',
    type: 'website',
  },
};

/**
 * Публичная главная. Здесь нет шапки приложения и запросов к API: страница открыта без пароля
 * (deploy/Caddyfile), а всё остальное приложение остаётся за ним.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing">
      <MotionProvider>{children}</MotionProvider>
    </div>
  );
}
