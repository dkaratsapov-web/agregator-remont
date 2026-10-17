/**
 * Вход и регистрация: слева фирменная панель (на десктопе), справа форма.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1600px] gap-10 px-4 pb-12 pt-8 sm:px-6 lg:px-10 md:pt-14 lg:grid-cols-2 lg:items-stretch lg:gap-12">
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden rounded-[28px] bg-[#0d1320] p-10 text-[#eef1f6] shadow-[0_30px_60px_-30px_rgb(13_19_32/0.55)] lg:flex lg:flex-col lg:justify-between"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_70%_30%,rgb(194_65_12/0.28),transparent_70%),linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[length:auto,32px_32px,32px_32px]" />
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
          Гарантыч
        </p>
        <div className="relative">
          <p className="font-display text-4xl font-semibold leading-[1.08] tracking-[-0.035em]">
            Честный ремонт без лишнего риска
          </p>
          <ul className="mt-8 space-y-3 text-white/70">
            <li>Заказ с бюджетом и городом за пару минут</li>
            <li>Отклики мастеров и бригад с ценой и сроком</li>
            <li>Профили исполнителей: опыт, специализации, города</li>
          </ul>
        </div>
      </aside>
      <div className="mx-auto w-full max-w-md lg:flex lg:flex-col lg:justify-center lg:py-8">
        <div className="rounded-[28px] border border-line/70 bg-surface p-6 shadow-[0_1px_1px_hsl(var(--shadow-color)/0.05),0_8px_24px_-8px_hsl(var(--shadow-color)/0.16)] sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
