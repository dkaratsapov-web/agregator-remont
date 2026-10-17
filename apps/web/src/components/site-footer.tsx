import Link from 'next/link';
import { Wordmark } from './landing/wordmark';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="self-start rounded-lg" aria-label="Гарантыч, на главную">
          <Wordmark />
        </Link>
        <p>
          Сейчас в каталоге демонстрационные заказы.{' '}
          <Link href="/jobs" className="font-medium text-ink underline underline-offset-4">
            Открыть каталог
          </Link>
        </p>
      </div>
    </footer>
  );
}
