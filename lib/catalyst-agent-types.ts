/** Catalyst sidebar + full-page chat agent modes */
export type CatalystAgentMode = 'general' | 'notes9' | 'literature';

/** Literature agent sub-modes (paper comparison vs Biomni research design) */
export type LiteratureSubMode = 'normal' | 'research_design';

export const LITERATURE_DRAG_MIME = 'application/x-notes9-literature-id';

export type LiteratureDragPayload = {
  id: string;
  title: string;
};

export function isLiteratureRoutePath(pathname: string | null): boolean {
  return Boolean(pathname?.startsWith('/literature-reviews'));
}
