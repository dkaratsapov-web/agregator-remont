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
      {/* Чертёжная сетка за страницами приложения; главная со своим фоном её не получает. */}
      <div aria-hidden="true" className="site-backdrop">
        <div className="site-backdrop__grid" />
        <div className="site-backdrop__glow" />
        <div className="site-backdrop__fade" />
      </div>
      <SiteHeader />
      <main id="main" className="pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
