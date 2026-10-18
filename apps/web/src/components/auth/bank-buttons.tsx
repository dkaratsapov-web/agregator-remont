import type { BankId } from '@/lib/api';

/**
 * Кнопки входа через банк. Цвета и подписи по правилам банков: Сбер ID — зелёная «Войти по
 * Сбер ID» без логотипа, Т-Банк — жёлтая. Это обычные ссылки на /auth/{банк}/start: всегда
 * нажимаются, без галочек и скриптов. Показываются, только если банк подключён на сервере.
 */
const STYLE: Record<BankId, { label: string; className: string }> = {
  sber: {
    label: 'Войти по Сбер ID',
    className: 'bg-[#21a038] text-white hover:bg-[#1c8a30]',
  },
  tbank: {
    label: 'Войти с Т-Банком',
    className: 'bg-[#ffdd2d] text-[#1c1c1e] hover:bg-[#f5d21f]',
  },
};

export function BankButtons({ links }: { links: { id: BankId; href: string }[] }) {
  if (links.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-3 text-xs text-ink-soft" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        или
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className={`mt-2.5 grid gap-2 ${links.length > 1 ? 'grid-cols-2' : ''}`}>
        {links.map(({ id, href }) => (
          <a
            key={id}
            href={href}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold sm:text-[15px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${STYLE[id].className}`}
          >
            {STYLE[id].label}
          </a>
        ))}
      </div>
    </div>
  );
}
