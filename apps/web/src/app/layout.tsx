import type { Metadata, Viewport } from 'next';
import { Onest, Unbounded } from 'next/font/google';
import { connection } from 'next/server';
import { ServiceWorkerRegister } from '@/components/sw-register';
import './globals.css';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-onest',
  display: 'swap',
});

const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-unbounded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Гарантыч: честный ремонт без лишнего риска',
    template: '%s | Гарантыч',
  },
  description: 'Гарантыч: заказы на ремонт с бюджетом, отклики мастеров и бригад с ценой и сроком.',
  applicationName: 'Гарантыч',
  appleWebApp: { capable: true, title: 'Гарантыч', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f5f7',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Каждая страница рендерится на запрос: в заранее собранный HTML нельзя вписать nonce этого
  // ответа (CSP, src/proxy.ts). Главная и кабинет и так динамические (сессия).
  await connection();
  return (
    <html lang="ru" className={`${onest.variable} ${unbounded.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-canvas"
        >
          Перейти к содержимому
        </a>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
