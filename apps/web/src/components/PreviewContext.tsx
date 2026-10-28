import { createContext, useContext, type ReactNode } from 'react';
import type { PreviewState } from '../fixtures/mock/types';

const PreviewContext = createContext<PreviewState>('default');

export function PreviewContextProvider({
  state,
  children,
}: {
  state: PreviewState;
  children: ReactNode;
}) {
  return <PreviewContext.Provider value={state}>{children}</PreviewContext.Provider>;
}

export function usePreviewState() {
  return useContext(PreviewContext);
}
