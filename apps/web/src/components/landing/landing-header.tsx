'use client';

import { motion, useMotionValueEvent, useScroll, useSpring } from 'motion/react';
import { useState } from 'react';
import { Wordmark } from './wordmark';

const LINKS = [
  { href: '#how-it-works', label: 'Как это работает' },
  { href: '#features', label: 'Возможности' },
  { href: '#about', label: 'О сервисе' },
];

/** Шапка главной: прозрачная наверху, «стеклянная» после прокрутки, с полосой прогресса. */
export function LandingHeader() {
  const { scrollY, scrollYProgress } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 40 });

  return (
    <header
      data-scrolled={scrolled}
      className="group fixed inset-x-0 top-0 z-40 border-b border-transparent transition-[background-color,border-color] duration-300 data-[scrolled=true]:border-line/80 data-[scrolled=true]:bg-canvas/95 supports-[backdrop-filter]:data-[scrolled=true]:bg-canvas/75 supports-[backdrop-filter]:data-[scrolled=true]:backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a
          href="#top"
          className="flex min-h-11 items-center rounded-lg"
          aria-label="Гарантыч, наверх"
        >
          <Wordmark />
        </a>
        <nav aria-label="Разделы главной" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium text-ink-soft transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href="/login"
          className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-canvas transition-[background-color,transform] duration-200 hover:bg-[#1c2536] active:scale-[0.97]"
        >
          Войти
        </a>
      </div>
      <motion.div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-[-1px] h-[2px] origin-left bg-accent"
        style={{ scaleX: progress }}
      />
    </header>
  );
}
