'use client';

import { createContext, useContext } from 'react';
import type { MenuUser } from '../account-menu';

/** Вошедший пользователь на главной: имя и роль для меню, остальные данные сюда не передаются. */
export type LandingViewer = MenuUser;

const ViewerContext = createContext<LandingViewer | null>(null);

export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: LandingViewer | null;
  children: React.ReactNode;
}) {
  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

export const useViewer = () => useContext(ViewerContext);
