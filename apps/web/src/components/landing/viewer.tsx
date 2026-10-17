'use client';

import { createContext, useContext } from 'react';

/** Вошедший пользователь на главной: только имя, остальные данные сюда не передаются. */
export interface LandingViewer {
  name: string;
}

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
