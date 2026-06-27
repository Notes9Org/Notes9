/**
 * Bridge literature-search results into the SAME citation contract the Catalyst
 * chat uses, so a literature summary renders with identical `[N]` chips and the
 * "All citations" panel (no second citation code path).
 *
 * Inputs are the AI-search result wrappers (which carry the `[N]` cite label the
 * summary text actually references). Outputs are:
 *   - `resources`: GroundingResource[]  → persisted in the §§NOTES9_GROUNDING§§
 *                  block via formatNotes9AssistantMarkdown, and shown in the
 *                  sources/citations panel.
 *   - `manifest`:  CitationsManifest    → drives the inline `[N]` chips.
 *
 * Deterministic string/regex only — no LLM (see [[feedback_deterministic_for_mechanical_ui]]).
 */
import type { GroundingResource } from '@/lib/agent-stream-types'
import type { CitationsManifest, CitationsManifestEntry } from '@/hooks/use-agent-stream'
import type { AiSearchResult } from '@/types/ai-search'

/** Source type used for literature papers; mirrors notes9 TOOL_USED 'literature'. */
export const LITERATURE_SOURCE_TYPE = 'paper'

/** "[3.2]" / "3.2" / " 3 " → "3.2". Empty/invalid → null. */
function normalizeLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = String(raw).match(/(\d+(?:\.\d+)*)/)
  return m ? m[1] : null
}

function paperUrl(r: AiSearchResult): string | null {
  const p = r.paper
  return (
    p?.articlePageUrl ||
    r.sourceUrl ||
    (p?.doi ? `https://doi.org/${p.doi}` : null) ||
    (p?.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/` : null) ||
    null
  )
}

function paperTitle(r: AiSearchResult): string {
  return (r.paper?.title || r.aiTitle || 'Untitled source').trim()
}

/** Best short excerpt for the citation panel: per-paper "why it matters" first,
 *  then the relevant snippet, then a trimmed abstract. */
function paperExcerpt(r: AiSearchResult): string | null {
  const raw = r.aiSummary || r.snippet || r.abstract || r.paper?.abstract || null
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed.length > 600 ? `${trimmed.slice(0, 597)}…` : trimmed
}

function sourceMeta(r: AiSearchResult): string {
  const p = r.paper
  const parts = [p?.journal, p?.year ? String(p.year) : null].filter(Boolean)
  return parts.join(' · ')
}

/**
 * Convert AI-search results → { resources, manifest } in the chat's citation
 * contract. Only results that carry a usable cite label AND identity are kept,
 * so the summary's `[N]` markers resolve to real chips.
 */
export function papersToGrounding(results: AiSearchResult[] | null | undefined): {
  resources: GroundingResource[]
  manifest: CitationsManifest
} {
  const resources: GroundingResource[] = []
  const manifest: Record<string, CitationsManifestEntry> = {}

  for (const r of results ?? []) {
    const label = normalizeLabel(r.citeLabel)
    if (!label || manifest[label]) continue

    const title = paperTitle(r)
    const url = paperUrl(r)
    const excerpt = paperExcerpt(r)
    const sourceId = r.dedupeKey || r.paper?.id || `lit_${label}`
    const index = Number.parseInt(label, 10)

    const resource: GroundingResource = {
      source_type: LITERATURE_SOURCE_TYPE,
      source_id: sourceId,
      display_label: label,
      source_name: title,
      ...(url ? { source_url: url } : {}),
      ...(excerpt ? { excerpt } : {}),
      ...(excerpt ? { cited_text: excerpt } : {}),
      support_status: null,
    } as GroundingResource

    const entry: CitationsManifestEntry = {
      ...(Number.isFinite(index) ? { index } : {}),
      cite_label: label,
      source_type: LITERATURE_SOURCE_TYPE,
      source_id: sourceId,
      source_name: title,
      ...(url ? { source_url: url } : {}),
      ...(excerpt ? { excerpt } : {}),
      match_kind: r.matchKind && r.matchKind !== 'none' ? 'exact' : 'semantic',
      ...(typeof r.paper?.relevanceScore === 'number'
        ? { relevance: r.paper.relevanceScore }
        : {}),
      support_status: null,
      grounding: 'heuristic',
    }

    resources.push(resource)
    manifest[label] = entry
    void sourceMeta // reserved for richer panels; kept deterministic
  }

  // Stable order by numeric label so the panel lists [1],[2],[3]…
  resources.sort(
    (a, b) =>
      Number.parseInt(a.display_label || '0', 10) -
      Number.parseInt(b.display_label || '0', 10),
  )

  return { resources, manifest: { manifest } }
}

/**
 * Compact literature context for grounding follow-up chat turns. Stored in
 * chat_sessions.metadata.literature and injected as a system message by
 * /api/chat (replaces the volatile primeCatalystCoPilot preamble).
 */
export interface LiteratureSessionContext {
  query: string
  papers: Array<{
    label: string
    title: string
    abstract?: string
    doi?: string
    pmid?: string
    year?: number
    url?: string
  }>
}

export function buildLiteratureSessionContext(
  query: string,
  results: AiSearchResult[] | null | undefined,
  maxPapers = 8,
): LiteratureSessionContext {
  const papers: LiteratureSessionContext['papers'] = []
  for (const r of results ?? []) {
    const label = normalizeLabel(r.citeLabel)
    if (!label) continue
    const abstract = (r.abstract || r.paper?.abstract || '').trim()
    papers.push({
      label,
      title: paperTitle(r),
      ...(abstract ? { abstract: abstract.slice(0, 700) } : {}),
      ...(r.paper?.doi ? { doi: r.paper.doi } : {}),
      ...(r.paper?.pmid ? { pmid: r.paper.pmid } : {}),
      ...(typeof r.paper?.year === 'number' ? { year: r.paper.year } : {}),
      ...(paperUrl(r) ? { url: paperUrl(r) as string } : {}),
    })
    if (papers.length >= maxPapers) break
  }
  return { query, papers }
}

/** Render the literature context as a hidden system message for /chat/stream. */
export function literatureContextToSystemMessage(ctx: LiteratureSessionContext): string {
  if (!ctx?.papers?.length) return ''
  const lines = ctx.papers.map((p) => {
    const meta = [p.title, p.year ? `(${p.year})` : null, p.doi ? `doi:${p.doi}` : null]
      .filter(Boolean)
      .join(' ')
    const abs = p.abstract ? ` — ${p.abstract}` : ''
    return `[${p.label}] ${meta}${abs}`
  })
  return (
    `You are the user's research co-pilot continuing a literature search. ` +
    `The user originally searched: "${ctx.query}". ` +
    `These papers were surfaced and the user may reference them by their [N] number:\n` +
    lines.join('\n')
  )
}
