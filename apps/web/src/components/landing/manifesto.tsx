'use client';

import { motion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { Fragment, useRef } from 'react';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

const BRAND = 'Гарантыч';

/** Название на плашке цвета акцента, как в заголовке героя. */
const plateClass =
  'absolute inset-x-0 bottom-[0.04em] top-[0.1em] -z-10 origin-left rounded-[0.18em] bg-accent';
const markClass = 'relative isolate inline-block px-[0.1em]';

function Word({
  word,
  index,
  total,
  progress,
}: {
  word: string;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const start = index / total;
  const end = start + 1 / total;
  const opacity = useTransform(progress, [start, end], [0.16, 1]);
  // Плашка проезжает под словом, пока оно проявляется; текст светлеет, когда она почти готова.
  const plate = useTransform(progress, [start, end], [0, 1]);
  const color = useTransform(progress, [start + 0.55 / total, end], ['#0d1320', '#ffffff']);
  if (!word.startsWith(BRAND)) {
    return (
      <>
        <motion.span style={{ opacity }}>{word}</motion.span>{' '}
      </>
    );
  }
  return (
    <>
      <motion.span style={{ opacity }}>
        <motion.span className={markClass} style={{ color }}>
          <motion.span aria-hidden="true" className={plateClass} style={{ scaleX: plate }} />
          {BRAND}
        </motion.span>
        {word.slice(BRAND.length)}
      </motion.span>{' '}
    </>
  );
}

/** Абзац «о нас», который проявляется по словам по мере прокрутки. */
export function Manifesto({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] });
  const reduce = usePrefersReducedMotion();
  const words = text.split(' ');
  return (
    <p
      ref={ref}
      // Слова нарочно бледные, пока до них не дошла прокрутка: проверка контраста их пропускает
      // (scripts/a11y-e2e.mjs); при «меньше движения» текст сразу полный.
      data-scroll-reveal=""
      className="font-display text-[1.6rem] font-medium leading-[1.25] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[3.1rem] xl:text-[3.5rem]"
    >
      {reduce
        ? text.split(BRAND).map((part, i) => (
            <Fragment key={i}>
              {i > 0 ? (
                <span className={`${markClass} text-accent-ink`}>
                  <span aria-hidden="true" className={plateClass} />
                  {BRAND}
                </span>
              ) : null}
              {part}
            </Fragment>
          ))
        : words.map((word, i) => (
            <Word
              key={`${word}-${i}`}
              word={word}
              index={i}
              total={words.length}
              progress={scrollYProgress}
            />
          ))}
    </p>
  );
}
