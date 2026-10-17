'use client';

import { motion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useRef } from 'react';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

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
  const opacity = useTransform(progress, [start, start + 1 / total], [0.16, 1]);
  return (
    <>
      <motion.span style={{ opacity }}>{word}</motion.span>{' '}
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
      className="font-display text-[1.6rem] font-medium leading-[1.25] tracking-[-0.03em] text-ink sm:text-4xl lg:text-[3.1rem]"
    >
      {reduce
        ? text
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
