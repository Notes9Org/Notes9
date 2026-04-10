'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type LiteratureMentionCandidate = {
  id: string;
  title: string;
  authors: string | null;
  catalog_placement: string | null;
};

type LiteratureMentionContextValue = {
  candidates: LiteratureMentionCandidate[];
  setCandidates: (rows: LiteratureMentionCandidate[]) => void;
};

const LiteratureMentionContext = createContext<LiteratureMentionContextValue | null>(null);

export function LiteratureMentionProvider({ children }: { children: ReactNode }) {
  const [candidates, setCandidatesState] = useState<LiteratureMentionCandidate[]>([]);

  const setCandidates = useCallback((rows: LiteratureMentionCandidate[]) => {
    setCandidatesState(rows);
  }, []);

  const value = useMemo(
    () => ({ candidates, setCandidates }),
    [candidates, setCandidates]
  );

  return (
    <LiteratureMentionContext.Provider value={value}>
      {children}
    </LiteratureMentionContext.Provider>
  );
}

export function useLiteratureMentionCandidates(): LiteratureMentionCandidate[] {
  const ctx = useContext(LiteratureMentionContext);
  return ctx?.candidates ?? [];
}

export function useLiteratureMentionRegister(): (rows: LiteratureMentionCandidate[]) => void {
  const ctx = useContext(LiteratureMentionContext);
  return ctx?.setCandidates ?? (() => {});
}
