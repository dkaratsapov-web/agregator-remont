import { DEFAULT_UI_PREFERENCES } from '@agregator/shared';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getCurrentUser } from '@/lib/session';

/**
 * Приложение (каталог, вход, кабинет). На проде закрыто паролем Caddy, см. deploy/Caddyfile.
 * Оформление из настроек пользователя ставится атрибутами на сервере, без мигания при загрузке.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const prefs = (await getCurrentUser())?.preferences ?? DEFAULT_UI_PREFERENCES;
  return (
    <div
      className="contents"
      data-ui-theme={prefs.theme}
      data-ui-scale={prefs.scale}
      data-ui-motion={prefs.motion}
    >
      <SiteHeader />
      <main id="main" className="pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
