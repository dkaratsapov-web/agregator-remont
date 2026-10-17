import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/** Приложение (каталог, вход, кабинет). На проде закрыто паролем Caddy, см. deploy/Caddyfile. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
