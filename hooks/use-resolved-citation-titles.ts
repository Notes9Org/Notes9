'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { resolveTitleFromId, isPlaceholderTitle } from '@/lib/citation-title'
import { normalizeAgentSourceType } from '@/lib/document-highlight'

export interface ResolvableCite {
  sourceType?: string | null
  sourceId?: string | null
  sourceUrl?: string | null
  /** The (possibly placeholder) title the citation arrived with. */
  currentTitle?: string | null
}

const keyOf = (
  sourceType: string | null | undefined,
  sourceId: string | null | undefined,
  sourceUrl: string | null | undefined,
) => `${normalizeAgentSourceType(sourceType ?? '')}|${sourceId ?? ''}|${sourceUrl ?? ''}`

/**
 * Resolve the REAL document titles for a message's citations in one batched
 * pass, keyed by (type, id, url), and hand back a lookup. Unlike the per-chip /
 * per-row async resolution (which never reached the inline manifest and often
 * raced the first render), this runs once for the whole message so the inline
 * citation chips AND the Sources list can both be enriched from a single source
 * of truth — lab notes, protocols, literature articles, papers and reports all
 * show their actual title instead of "Untitled …".
 */
export function useResolvedCitationTitles(
  refs: ResolvableCite[],
): (
  sourceType?: string | null,
  sourceId?: string | null,
  sourceUrl?: string | null,
) => string | null {
  const [resolved, setResolved] = useState<Record<string, string>>({})

  const pending = useMemo(
    () =>
      refs.filter(
        (r) =>
          (r.sourceId || r.sourceUrl) && isPlaceholderTitle(r.currentTitle, r.sourceType ?? ''),
      ),
    [refs],
  )
  const sig = useMemo(
    () =>
      Array.from(new Set(pending.map((r) => keyOf(r.sourceType, r.sourceId, r.sourceUrl))))
        .sort()
        .join(';'),
    [pending],
  )

  useEffect(() => {
    if (!sig) return
    let cancelled = false
    const uniq = new Map<string, ResolvableCite>()
    for (const r of pending) uniq.set(keyOf(r.sourceType, r.sourceId, r.sourceUrl), r)
    Promise.all(
      Array.from(uniq.entries()).map(async ([k, r]) => {
        const t = await resolveTitleFromId(r.sourceType ?? '', r.sourceId, r.sourceUrl)
        return t ? ([k, t] as const) : null
      }),
    ).then((entries) => {
      if (cancelled) return
      setResolved((prev) => {
        let changed = false
        const next = { ...prev }
        for (const e of entries) {
          if (e && next[e[0]] !== e[1]) {
            next[e[0]] = e[1]
            changed = true
          }
        }
        return changed ? next : prev
      })
    })
    return () => {
      cancelled = true
    }
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  return useCallback(
    (sourceType, sourceId, sourceUrl) => resolved[keyOf(sourceType, sourceId, sourceUrl)] ?? null,
    [resolved],
  )
}
