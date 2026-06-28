'use client'

/**
 * Live bridge for the literature search's AI summary. The summary is composed by
 * the literature page (via /api/chat) and streamed here so the Catalyst sidebar
 * can display it — with its references — the moment a search starts. Follow-up
 * questions are handled by the sidebar's own stream endpoint; the summary is
 * available to that agent via the co-pilot context.
 */

import { useEffect, useState } from 'react'
import type { GroundingResource } from '@/lib/agent-stream-types'
import type { CitationsManifest } from '@/hooks/use-agent-stream'
import type { LiteratureSessionContext } from '@/lib/literature-citations'

export interface LiteratureRef {
  n: string
  title: string
  meta: string
  href: string | null
}

export interface CatalystLiterature {
  /** The user's search query (shown as the question above the summary). */
  query: string
  /** The cited summary text (markdown), updated live while streaming. */
  summary: string
  /** True while the summary is still composing. */
  streaming: boolean
  /** Cited papers, shown under the summary. */
  references: LiteratureRef[]
  /** ID of the persisted chat session for this literature search (set once the
   *  session has been saved so the "Continue in Catalyst" button can open it). */
  sessionId?: string | null
  /** Grounding resources in the unified citation contract (GroundingResource[]). */
  resources?: GroundingResource[]
  /** Citations manifest driving inline [N] chips in the rendered summary. */
  manifest?: CitationsManifest | null
  /** Compact literature context stored in the session's metadata.literature and
   *  injected as a system message for follow-up turns. */
  context?: LiteratureSessionContext | null
}

export const CATALYST_LITERATURE_EVENT = 'notes9:catalyst-literature'

let current: CatalystLiterature | null = null

/** Push the latest summary state and notify the sidebar. */
export function setCatalystLiterature(next: CatalystLiterature | null) {
  current = next
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CATALYST_LITERATURE_EVENT, { detail: next }))
  }
}

export function getCatalystLiterature(): CatalystLiterature | null {
  return current
}

/** Subscribe to the live literature summary (reads the current value on mount). */
export function useCatalystLiterature(): CatalystLiterature | null {
  const [state, setState] = useState<CatalystLiterature | null>(() => current)
  useEffect(() => {
    setState(current)
    const onChange = (e: Event) =>
      setState((e as CustomEvent<CatalystLiterature | null>).detail)
    window.addEventListener(CATALYST_LITERATURE_EVENT, onChange)
    return () => window.removeEventListener(CATALYST_LITERATURE_EVENT, onChange)
  }, [])
  return state
}
