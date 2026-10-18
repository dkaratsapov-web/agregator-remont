'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Пункт переключателя разделов в шапке. Активный — тёмная плашка с терракотовой меткой. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isAnchor = href.includes('#');
  const active = !isAnchor && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex min-h-9 items-center gap-2 rounded-[9px] px-3.5 text-sm font-semibold transition-colors duration-150 ${
        active ? 'bg-ink text-canvas' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
      }`}
    >
      {active ? <span aria-hidden="true" className="size-1.5 rounded-[1px] bg-accent" /> : null}
      {children}
    </Link>
  );
}
