'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isAnchor = href.includes('#');
  const active = !isAnchor && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors duration-150 hover:bg-muted-tint ${
        active
          ? 'font-semibold text-ink underline decoration-accent decoration-2 underline-offset-[6px]'
          : 'font-medium text-ink-soft hover:text-ink'
      }`}
    >
      {children}
    </Link>
  );
}
