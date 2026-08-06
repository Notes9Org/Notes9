'use client'

/**
 * Module-level singleton that owns the AI literature search's SSE lifecycle.
 *
 * WHY THIS EXISTS: `useAiLiteratureSearch` used to own the fetch/AbortController
 * and abort on unmount (`useEffect(() => () => stop(), [stop])`). That ties a
 * search's lifetime to one component instance, so toggling Search ↔ My Library
 * or navigating to a project (both unmount `AiSearchView`) killed an in-flight
 * search. Hoisting the fetch/parse/cache logic here means it keeps running at
 * module scope; the hook becomes a thin `useSyncExternalStore` subscriber that
 * unsubscribes (not aborts) on unmount. See use-ai-literature-search.ts.
 *
 * ponytail: survives SPA navigation/tab switches but NOT a full page reload or
 * tab close (no service worker / server job). That's the intentional ceiling
 * upgrade path is a server-side search job if cross-reload resume is ever needed.
 *
 * SSE event contract (see api/literature_ai_search.py):
 *   papers → paper_summary* → overall_summary → done   (or error)
 */

import type { SearchPaper } from '@/types/paper-search'
import type { CitationsManifest } from '@/hooks/use-agent-stream'
import { recordRumEvent } from '@/lib/rum'
import { AnalyticsEvent } from '@/lib/analytics/events'
import { createClient } from '@/lib/supabase/client'

export type CachedAi = { summary: string; papers: SearchPaper[]; manifest?: CitationsManifest | null }
/** Completed answers cached per query so results survive unmounts (tab switches)
 *  and aren't re-fetched until a different query runs. Module-level on purpose. */
export const aiSearchCache = new Map<string, CachedAi>()

function cacheKeyForSearch(query: string): string {
  return query
}

/* sessionStorage layer under the module Map: survives navigating away (dashboard →
 * back) and soft reloads within the tab; cleared on tab close. Bounded to the last
 * few queries so it never bloats. The module Map stays the fast in-memory hit; this
 * only rehydrates it after the JS bundle re-runs. Fail-safe: any storage error is a
 * no-op (private mode / quota) and we simply re-fetch (backend 24h cache makes that cheap). */
const SS_PREFIX = 'n9-litsearch:'
const SS_INDEX = 'n9-litsearch-index'
const SS_MAX = 5

function ssKey(key: string): string {
  return SS_PREFIX + key.trim().toLowerCase().replace(/\s+/g, ' ')
}

function readSessionSearch(key: string): CachedAi | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.sessionStorage.getItem(ssKey(key))
    return raw ? (JSON.parse(raw) as CachedAi) : undefined
  } catch {
    return undefined
  }
}

function writeSessionSearch(key: string, value: CachedAi): void {
  if (typeof window === 'undefined') return
  try {
    const k = ssKey(key)
    window.sessionStorage.setItem(k, JSON.stringify(value))
    let index: string[] = []
    try {
      index = JSON.parse(window.sessionStorage.getItem(SS_INDEX) || '[]')
    } catch {
      index = []
    }
    index = [k, ...index.filter((x) => x !== k)]
    while (index.length > SS_MAX) {
      const evict = index.pop()
      if (evict) window.sessionStorage.removeItem(evict)
    }
    window.sessionStorage.setItem(SS_INDEX, JSON.stringify(index))
  } catch {
    /* quota / private mode, persistence is best-effort */
  }
}

/** Free-tier quota notice parsed from a 429 problem+json response. */
export interface AiSearchLimitInfo {
  code: 'lit_search_weekly' | 'ai_budget_monthly'
  used: number | null
  limit: number | null
  resetAt: string | null
}

interface SsePapersEvent {
  query: string
  papers: SearchPaper[]
  totalCount: number
  pipeline?: Record<string, unknown>
}

/** Parse a single SSE block ("event: x\ndata: {...}") into [event, data]. */
function parseSseBlock(block: string): [string, unknown] | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  try {
    return [event, JSON.parse(dataLines.join('\n'))]
  } catch {
    return null
  }
}

export interface EngineState {
  papers: SearchPaper[]
  summary: string
  manifest: CitationsManifest | null
  isStreaming: boolean
  phase: string | null
  phases: string[]
  error: string | null
  limitInfo: AiSearchLimitInfo | null
  activeQuery: string | null
}

const EMPTY_STATE: EngineState = {
  papers: [],
  summary: '',
  manifest: null,
  isStreaming: false,
  phase: null,
  phases: [],
  error: null,
  limitInfo: null,
  activeQuery: null,
}

let state: EngineState = EMPTY_STATE
const listeners = new Set<() => void>()

// Same guards the hook used to own: dedupe the current query, track the
// active AbortController, and a monotonic request id so a superseded
// request's late events can never clobber a newer request's state.
let lastRunQuery: string | null = null
let abortController: AbortController | null = null
let requestSeq = 0

function setState(patch: Partial<EngineState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): EngineState {
  return state
}

export function getServerSnapshot(): EngineState {
  return EMPTY_STATE
}

/** Real abort, used by the manual Stop button. Unmounting a subscriber must
 *  NOT call this; it should just unsubscribe (handled by useSyncExternalStore). */
export function stop(requestedQuery: string) {
  requestSeq += 1
  abortController?.abort()
  abortController = null
  // Force inSync (activeQuery === requested) so the hook's derived isStreaming
  // can't stay true after an abort, otherwise the search bar re-locks, making
  // Stop look broken.
  setState({ isStreaming: false, phase: null, activeQuery: requestedQuery })
  // Clear the dedupe guard so the SAME query can run again after an abort.
  lastRunQuery = null
}

/** Seed the cache for an instant, no-LLM restore (Deliverable 2: history click).
 *  Callers then call run(query), it will hit this cache and return immediately. */
export function restore(query: string, entry: CachedAi) {
  const cacheKey = cacheKeyForSearch(query)
  aiSearchCache.set(cacheKey, entry)
  writeSessionSearch(cacheKey, entry)
}

/** Drop the cached answer + dedupe guard for a query so the next run() re-fetches
 *  live instead of replaying the cache (Deliverable 2: history "↻ Refresh"). */
export function forgetCache(query: string) {
  const cacheKey = cacheKeyForSearch(query)
  aiSearchCache.delete(cacheKey)
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(ssKey(cacheKey))
    } catch {
      /* best-effort */
    }
  }
  if (lastRunQuery === cacheKey) lastRunQuery = null
}

export async function run(q0: string): Promise<void> {
  const q = q0.trim()
  if (!q) return
  const cacheKey = cacheKeyForSearch(q)
  if (cacheKey === lastRunQuery) return // already current, never re-run
  lastRunQuery = cacheKey
  const requestId = requestSeq + 1
  requestSeq = requestId
  abortController?.abort()
  abortController = null
  setState({ activeQuery: q, error: null, limitInfo: null })

  // Restore a completed answer from cache, no network call. Fall back to the
  // sessionStorage layer (survives dashboard round-trips / soft reload) and
  // rehydrate the module Map so subsequent hits stay in-memory.
  let cached = aiSearchCache.get(cacheKey)
  if (!cached) {
    const persisted = readSessionSearch(cacheKey)
    if (persisted) {
      aiSearchCache.set(cacheKey, persisted)
      cached = persisted
    }
  }
  if (cached) {
    setState({
      papers: cached.papers,
      summary: cached.summary,
      manifest: cached.manifest ?? null,
      isStreaming: false,
    })
    return
  }

  const controller = new AbortController()
  abortController = controller

  setState({ papers: [], summary: '', manifest: null, phase: 'searching', phases: ['searching'], isStreaming: true })

  const searchStartedAt = Date.now()
  recordRumEvent(AnalyticsEvent.LITERATURE_SEARCH_STARTED, { query_length: q.length })

  let receivedPapers: SearchPaper[] = []
  let overall = ''
  let receivedManifest: CitationsManifest | null = null
  // Backend-emitted `error` SSE events end the stream WITHOUT throwing, so
  // they never hit the catch below. Track them so the run is treated as a
  // failure: guard cleared (Try again re-runs) and nothing cached.
  let sawError = false
  const isActiveRequest = () => requestSeq === requestId

  try {
    const res = await fetch('/api/literature/ai-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Cap at 10 results, the backend summarizes each paper, so a smaller
      // set keeps token cost low.
      body: JSON.stringify({ query: q, limit: 10 }),
      signal: controller.signal,
    })
    if (res.status === 429) {
      // Free-tier quota reached, a fact, not a failure.
      let body: Record<string, unknown> = {}
      try {
        body = (await res.json()) as Record<string, unknown>
      } catch {
        /* body optional, defaults below */
      }
      setState({
        limitInfo: {
          code: body.limit_code === 'ai_budget_monthly' ? 'ai_budget_monthly' : 'lit_search_weekly',
          used: typeof body.used === 'number' ? body.used : null,
          limit: typeof body.limit === 'number' ? body.limit : null,
          resetAt: typeof body.reset_at === 'string' ? body.reset_at : null,
        },
        isStreaming: false,
        phase: null,
      })
      lastRunQuery = null
      recordRumEvent(AnalyticsEvent.AI_LIMIT_REACHED, {
        feature: 'literature_search',
        limit_code: String(body.limit_code ?? 'lit_search_weekly'),
      })
      return
    }
    if (!res.ok || !res.body) {
      throw new Error(`Literature search failed (${res.status})`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!isActiveRequest()) break
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        if (!isActiveRequest()) break
        const parsed = parseSseBlock(block)
        if (!parsed) continue
        const [event, data] = parsed
        if (event === 'status') {
          const p = (data as { phase?: string }).phase
          if (p && isActiveRequest()) {
            setState({ phase: p, phases: state.phases[state.phases.length - 1] === p ? state.phases : [...state.phases, p] })
          }
        } else if (event === 'papers') {
          const payload = data as SsePapersEvent
          receivedPapers = Array.isArray(payload.papers) ? payload.papers : []
          if (isActiveRequest()) setState({ papers: receivedPapers })
        } else if (event === 'paper_summary') {
          const { id, text } = data as { id: string; text: string }
          if (id && text) {
            if (isActiveRequest()) {
              setState({
                papers: state.papers.map((p) => (String(p.id) === String(id) ? { ...p, aiSummary: text } : p)),
              })
            }
            receivedPapers = receivedPapers.map((p) => (String(p.id) === String(id) ? { ...p, aiSummary: text } : p))
          }
        } else if (event === 'overall_summary') {
          // Try all field names the Python backend may use. Treat empty/
          // whitespace as absent so a blank `text` doesn't win over a real
          // `content`/`summary` (`??` would keep the empty string).
          const raw = data as { text?: string; content?: string; summary?: string }
          const firstNonEmpty = [raw.text, raw.content, raw.summary].find(
            (v) => typeof v === 'string' && v.trim().length > 0,
          )
          overall = String(firstNonEmpty ?? '')
          if (isActiveRequest()) setState({ summary: overall })
        } else if (event === 'citations_manifest') {
          // Server-authoritative manifest (same wire shape as the main agent:
          // { manifest: { "1": {...} } }). Chips resolve against this instead
          // of a client-fabricated one.
          const m = (data as { manifest?: CitationsManifest['manifest'] }).manifest
          if (m && typeof m === 'object') {
            receivedManifest = { manifest: m }
            if (isActiveRequest()) setState({ manifest: receivedManifest })
          }
        } else if (event === 'error') {
          sawError = true
          if (isActiveRequest()) setState({ error: String((data as { error?: string }).error ?? 'Literature search failed.') })
        }
        // `done` needs no special handling, the loop ends with the stream.
      }
    }

    // Stop any lingering per-card shimmers and cache the completed answer.
    if (isActiveRequest()) setState({ papers: state.papers.map((p) => ({ ...p })) })
    if (sawError) {
      // Failed run: clear the dedupe guard so the error banner's "Try again"
      // actually re-runs, and do NOT cache, a cached partial would replay
      // the broken state on every retry and across reloads via sessionStorage.
      if (requestSeq === requestId) {
        lastRunQuery = null
        recordRumEvent(AnalyticsEvent.LITERATURE_SEARCH_FAILED, {
          reason: 'stream_error',
          duration_ms: Date.now() - searchStartedAt,
        })
      }
    } else {
      if (receivedPapers.length > 0) {
        const entry: CachedAi = { summary: overall, papers: receivedPapers, manifest: receivedManifest }
        aiSearchCache.set(cacheKey, entry)
        writeSessionSearch(cacheKey, entry)
      }
      if (requestSeq === requestId) {
        recordRumEvent(AnalyticsEvent.LITERATURE_SEARCH_COMPLETED, {
          paper_count: receivedPapers.length,
          has_summary: overall.trim().length > 0,
          duration_ms: Date.now() - searchStartedAt,
        })
        // Authoritative history write, fires regardless of whether the
        // right-sidebar bridge is mounted/reacting (Deliverable 1).
        if (receivedPapers.length > 0) void persistHistory(q, overall, receivedPapers, receivedManifest)
      }
    }
  } catch (e) {
    // Only the still-active request may touch shared state, a superseded
    // request must not clear the newer one's retry guard or set its error.
    if ((e as Error)?.name !== 'AbortError' && requestSeq === requestId) {
      lastRunQuery = null
      setState({ error: e instanceof Error ? e.message : 'The AI search failed. Please try again.' })
      recordRumEvent(AnalyticsEvent.LITERATURE_SEARCH_FAILED, {
        reason: 'exception',
        duration_ms: Date.now() - searchStartedAt,
      })
    }
  } finally {
    if (abortController === controller) abortController = null
    // Only the still-active request may flip global loading/phase. A search
    // superseded by a newer one must NOT clear the new search's streaming state.
    if (requestSeq === requestId) setState({ isStreaming: false, phase: null })
  }
}

/**
 * Persist the search as chat_sessions row (kind='literature') so it shows up
 * in history regardless of whether the right-sidebar Catalyst bridge is
 * mounted. Dedupes against the newest literature session for this user: same
 * normalized query touches/updates that row instead of inserting a duplicate.
 * Fire-and-forget, fail-open, a failed write only drops the search from
 * "recent searches"; the search itself already succeeded.
 */
async function persistHistory(
  query: string,
  summary: string,
  papers: SearchPaper[],
  manifest: CitationsManifest | null,
): Promise<void> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const normalized = query.trim().toLowerCase()
    const title = query.slice(0, 80)
    const metadata = {
      literature: {
        query,
        summary: summary.slice(0, 6000),
        papers: papers.slice(0, 10),
        manifest,
      },
    }

    // Match ANY existing literature session with the same normalized query, not just the
    // most-recent one, otherwise re-running an older query inserts a duplicate row.
    const { data: candidates } = await supabase
      .from('chat_sessions')
      .select('id, title')
      .eq('user_id', user.id)
      .eq('kind', 'literature')
      .order('updated_at', { ascending: false })
      .limit(100)

    const existing = candidates?.find(
      (s: { title: string | null }) => (s.title ?? '').trim().toLowerCase() === normalized,
    )

    if (existing) {
      await supabase
        .from('chat_sessions')
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('chat_sessions').insert({ user_id: user.id, kind: 'literature', title, metadata })
    }
  } catch {
    // ponytail: best-effort history write, see doc comment above.
  }
}
