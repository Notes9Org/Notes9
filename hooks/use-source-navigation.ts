'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  buildHighlightUrl,
  dispatchDocumentHighlight,
  normalizeAgentSourceType,
  type HighlightTarget,
} from '@/lib/document-highlight'
import { resolveLabNoteExperimentId } from '@/lib/citation-title'

/** Detail-page route for a workspace record (no highlight). */
function workspaceRoute(sourceType: string, sourceId: string): string {
  switch (normalizeAgentSourceType(sourceType)) {
    case 'literature_review':
      return `/literature-reviews/${sourceId}`
    case 'protocol':
      return `/protocols/${sourceId}`
    case 'report':
      return `/reports/${sourceId}`
    case 'lab_note':
      return `/lab-notes/${sourceId}`
    case 'experiment':
      return `/experiments/${sourceId}`
    case 'project':
      return `/projects/${sourceId}`
    default:
      return ''
  }
}

export interface SourceNavDescriptor {
  sourceType: string
  sourceId?: string | null
  sourceUrl?: string | null
  excerpt?: string | null
  charStart?: number | null
  charEnd?: number | null
}

/**
 * The single place workspace-source / citation navigation lives — shared by the
 * inline citation chips, the source-viewer "Open document", and the Sources
 * panel. Web URLs open a tab; a same-page doc viewer just scrolls to the excerpt
 * (no reload); otherwise we SPA-navigate, letting the Catalyst full page dock the
 * chat into the sidebar first. Lab notes resolve their parent experiment
 * client-side so we deep-link straight to /experiments/<exp>?tab=notes&noteId=…
 * instead of bouncing through the /lab-notes/<id> server redirect.
 */
export function useSourceNavigation(): (desc: SourceNavDescriptor) => void {
  const router = useRouter()
  return useCallback(
    (desc: SourceNavDescriptor) => {
      if (desc.sourceUrl && /^https?:\/\//i.test(desc.sourceUrl)) {
        window.open(desc.sourceUrl, '_blank', 'noopener,noreferrer')
        return
      }
      if (!desc.sourceId) return
      const normalizedType = normalizeAgentSourceType(desc.sourceType)
      const spanText = desc.excerpt || ''
      const target: HighlightTarget = {
        sourceType: normalizedType,
        sourceId: desc.sourceId,
        excerpt: spanText,
        contentSurface: normalizedType === 'literature_review' ? 'abstract' : null,
        charRange:
          desc.charStart != null && desc.charEnd != null
            ? { start: desc.charStart, end: desc.charEnd }
            : null,
      }
      // Same-page doc viewers handle this (scroll to the excerpt, no reload) —
      // also how a second citation into the SAME open document just scrolls.
      if (spanText && dispatchDocumentHighlight(target)) return

      const navigate = (dest: string) => {
        if (!dest) return
        if (typeof window !== 'undefined') {
          const beforeNav = new CustomEvent('notes9:catalyst-before-navigate', {
            detail: { href: dest },
            cancelable: true,
          })
          window.dispatchEvent(beforeNav)
          if (beforeNav.defaultPrevented) return
        }
        router.push(dest)
      }

      if (normalizedType === 'lab_note') {
        const fallback =
          (spanText ? buildHighlightUrl(target) : '') ||
          workspaceRoute(desc.sourceType, desc.sourceId)
        void resolveLabNoteExperimentId(desc.sourceId).then((expId) => {
          navigate(expId ? buildHighlightUrl(target, { experimentId: expId }) : fallback)
        })
        return
      }

      const href = spanText
        ? buildHighlightUrl(target) || workspaceRoute(desc.sourceType, desc.sourceId)
        : workspaceRoute(desc.sourceType, desc.sourceId)
      navigate(href)
    },
    [router],
  )
}
