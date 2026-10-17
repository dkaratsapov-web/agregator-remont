import type { Metadata, Viewport } from 'next';
import { Unbounded } from 'next/font/google';
import { MotionProvider } from '@/components/landing/motion-provider';
import './landing.css';

const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-unbounded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { absolute: 'Гарантыч: ремонт с понятной ценой и сроком' },
  description:
    'Гарантыч соединяет заказчиков ремонта с мастерами и бригадами: заказ с бюджетом, отклики с ценой и сроком, выбор исполнителя.',
  openGraph: {
    title: 'Гарантыч: ремонт с понятной ценой и сроком',
    description: 'Заказ с бюджетом, отклики мастеров с ценой и сроком, выбор исполнителя.',
    locale: 'ru_RU',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#f4f5f7',
  colorScheme: 'light',
};

/**
 * Публичная главная. Здесь нет шапки приложения и запросов к API: страница открыта без пароля
 * (deploy/Caddyfile), а всё остальное приложение остаётся за ним.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`landing ${unbounded.variable}`}>
      <MotionProvider>{children}</MotionProvider>
    </div>
  );
}
