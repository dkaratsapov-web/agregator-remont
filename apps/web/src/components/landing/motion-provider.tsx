'use client';

import { MotionConfig } from 'motion/react';

/** reducedMotion="user": при настройке «меньше движения» Motion отключает сдвиги и масштаб. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
