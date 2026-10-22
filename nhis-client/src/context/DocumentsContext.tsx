import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DocumentRecord } from '@nhis/shared-types';
import { useDocuments } from '../hooks/useContent';
import type { AsyncState } from '../types/async';
import type { DocumentListResponse } from '@nhis/shared-types';

export interface DocumentsContextValue {
  state: AsyncState<DocumentListResponse>;
  byId: ReadonlyMap<string, DocumentRecord>;
}

/** Exported so that render tests can provide a registry without a network request. Use `useDocumentRegistry()` in components. */
export const DocumentsContext = createContext<DocumentsContextValue | undefined>(undefined);

/** Document registry, loaded once so notices, page links and document lists resolve the same records. */
export function DocumentsProvider({ children }: { children: ReactNode }) {
  const state = useDocuments();
  const byId = useMemo(() => new Map((state.data?.data ?? []).map((doc) => [doc.id, doc])), [state.data]);
  const value = useMemo(() => ({ state, byId }), [state, byId]);
  return <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>;
}

export function useDocumentRegistry(): DocumentsContextValue {
  const value = useContext(DocumentsContext);
  if (!value) throw new Error('useDocumentRegistry must be used inside <DocumentsProvider>');
  return value;
}
