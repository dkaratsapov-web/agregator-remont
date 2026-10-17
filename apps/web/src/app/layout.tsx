import type { Metadata, Viewport } from 'next';
import { Onest } from 'next/font/google';
import { ServiceWorkerRegister } from '@/components/sw-register';
import './globals.css';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-onest',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Агрегатор Ремонт: заказы на ремонт и строительство',
    template: '%s | Агрегатор Ремонт',
  },
  description:
    'Каталог заказов на ремонт и строительство: бюджет, город и описание работ в одном месте.',
  applicationName: 'Агрегатор Ремонт',
  appleWebApp: { capable: true, title: 'Ремонт', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#121925' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
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
