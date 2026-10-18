/**
 * Вход и регистрация: одна карточка с формой по центру первого экрана, без прокрутки на
 * компьютере. Подвал на этих страницах скрыт (globals.css, .auth-screen), чтобы страница
 * помещалась в экран целиком.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-screen flex min-h-[calc(100svh-4.25rem)] items-center justify-center px-4 py-4 sm:px-6 sm:py-6 [@media(max-height:46rem)]:py-2">
      <div className="w-full max-w-[34rem] rounded-[28px] border border-line/70 bg-surface p-5 shadow-[0_1px_1px_hsl(var(--shadow-color)/0.05),0_8px_24px_-8px_hsl(var(--shadow-color)/0.16)] sm:p-8 [@media(max-height:46rem)]:sm:py-5">
        {children}
      </div>
    </div>
  );
}
