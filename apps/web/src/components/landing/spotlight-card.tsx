'use client';

/** Карточка с мягкой подсветкой под курсором (позиция в CSS-переменных, без перерисовок React). */
export function SpotlightCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }
  return (
    <article onPointerMove={onPointerMove} className={`spotlight ${className}`}>
      {children}
    </article>
  );
}
