/**
 * Citation store — React context + useReducer.
 *
 * Single source of truth for all citation state within a TiptapEditor instance.
 * Manages: ordered citation list, selected style, and provides actions to
 * add/remove/reorder citations and apply changes to editor HTML.
 */

import { createContext, useContext, useReducer, useCallback, type Dispatch } from 'react'
import {
  type CitationMetadata,
  CITATION_STYLE_OPTIONS,
  formatInlineCitation,
  formatCitation,
  metadataFromAttrs,
  parseCitationsFromHtml,
  reformatInlineCitations,
  reformatBibliography,
} from './citation-utils'
import { isValidTiptapCitationStyle, readPaperCitationStyle } from './paper-citation-style-sync'

// Re-export for convenience
export { CITATION_STYLE_OPTIONS }
export type { CitationMetadata }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface CitationEntry {
  /** Stable unique key (e.g. paperId or generated id) */
  key: string
  metadata: CitationMetadata
}

export interface CitationState {
  /** Ordered list — index+1 = citation number */
  entries: CitationEntry[]
  /** Active citation style id */
  style: string
}

const INITIAL_STATE: CitationState = {
  entries: [],
  style: 'APA',
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type CitationAction =
  | { type: 'SET_STYLE'; style: string }
  | { type: 'SYNC_FROM_HTML'; entries: CitationEntry[] }
  | { type: 'ADD_CITATIONS'; citations: CitationEntry[]; afterNumber?: number }
  | { type: 'REMOVE_CITATION'; key: string }
  | { type: 'CLEAR' }

function citationReducer(state: CitationState, action: CitationAction): CitationState {
  switch (action.type) {
    case 'SET_STYLE':
      return { ...state, style: action.style }

    case 'SYNC_FROM_HTML':
      return { ...state, entries: action.entries }

    case 'ADD_CITATIONS': {
      const insertIdx = action.afterNumber != null
        ? Math.min(action.afterNumber, state.entries.length)
        : state.entries.length
      const newEntries = [...state.entries]
      newEntries.splice(insertIdx, 0, ...action.citations)
      // Renumber
      return {
        ...state,
        entries: newEntries.map((e, i) => ({
          ...e,
          metadata: { ...e.metadata, citationNumber: i + 1 },
        })),
      }
    }

    case 'REMOVE_CITATION': {
      const filtered = state.entries.filter(e => e.key !== action.key)
      return {
        ...state,
        entries: filtered.map((e, i) => ({
          ...e,
          metadata: { ...e.metadata, citationNumber: i + 1 },
        })),
      }
    }

    case 'CLEAR':
      return INITIAL_STATE

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface CitationStore {
  state: CitationState
  dispatch: Dispatch<CitationAction>
}

export const CitationContext = createContext<CitationStore | null>(null)

export function useCitationStore(): CitationStore {
  const ctx = useContext(CitationContext)
  if (!ctx) throw new Error('useCitationStore must be used within CitationProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Hook: initialise reducer (to be called inside the provider component)
// ---------------------------------------------------------------------------

export function useCitationReducer(syncWithPaperStorage = false) {
  return useReducer(
    citationReducer,
    INITIAL_STATE,
    (base: CitationState) => {
      if (!syncWithPaperStorage || typeof window === "undefined") return base
      const saved = readPaperCitationStyle()
      if (saved && isValidTiptapCitationStyle(saved)) {
        return { ...base, style: saved }
      }
      return base
    }
  )
}

// ---------------------------------------------------------------------------
// Helper: sync store from editor HTML (call after editor loads or content changes externally)
// ---------------------------------------------------------------------------

export function syncStoreFromHtml(html: string, dispatch: Dispatch<CitationAction>) {
  const parsed = parseCitationsFromHtml(html)
  const entries: CitationEntry[] = parsed.map(p => ({
    key: p.paperId || `plain-${p.number}`,
    metadata: {
      citationNumber: p.number,
      url: p.url,
      title: p.title,
      authors: p.authors,
      year: p.year,
      journal: p.journal,
      doi: p.doi,
      paperId: p.paperId,
    },
  }))
  dispatch({ type: 'SYNC_FROM_HTML', entries })
}

// ---------------------------------------------------------------------------
// Helper: apply current store state to editor HTML
// ---------------------------------------------------------------------------

export function applyStoreToHtml(html: string, state: CitationState): string {
  // Build metadata map from store entries
  const metaMap = new Map<number, CitationMetadata>()
  state.entries.forEach((e, i) => {
    metaMap.set(i + 1, { ...e.metadata, citationNumber: i + 1 })
  })

  // Reformat inline citations
  let result = reformatInlineCitations(html, state.style)

  // Reformat bibliography if it exists
  if (metaMap.size > 0) {
    result = reformatBibliography(result, metaMap, state.style)
  }

  return result
}

// ---------------------------------------------------------------------------
// Helper: build metadata map from store state
// ---------------------------------------------------------------------------

export function buildMetadataMap(state: CitationState): Map<number, CitationMetadata> {
  const map = new Map<number, CitationMetadata>()
  state.entries.forEach((e, i) => {
    map.set(i + 1, { ...e.metadata, citationNumber: i + 1 })
  })
  return map
}
