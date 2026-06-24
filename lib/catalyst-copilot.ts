/**
 * Literature co-pilot context. When a literature search runs we "prime" Catalyst
 * with the search — the question, the papers (title + abstract + metadata) and
 * the AI summary — so that whenever the user opens the Catalyst sidebar it can
 * already answer questions about any paper or the overall research area, without
 * the user having to attach or "drop" anything first. Auto-primed on search,
 * surfaced on demand. Stored at module level so it survives the sidebar (which
 * only mounts when opened) and is read on open.
 */

export interface CoPilotPaper {
  /** Citation number shown in the UI (1, 2, 3, …). */
  n: string
  title: string
  authors?: string
  journal?: string
  year?: number | null
  abstract?: string
  url?: string | null
  openAccess?: boolean
}

export interface CoPilotContext {
  query: string
  papers: CoPilotPaper[]
  summary?: string
  /** Caller-supplied timestamp (the lib never reads the clock itself). */
  primedAt?: number
}

export const CATALYST_COPILOT_EVENT = 'notes9:catalyst-copilot'

let current: CoPilotContext | null = null

/** Store the current search as co-pilot context and notify any open sidebar. */
export function primeCatalystCoPilot(ctx: CoPilotContext) {
  current = ctx
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CATALYST_COPILOT_EVENT, { detail: ctx }))
  }
}

export function getCatalystCoPilot(): CoPilotContext | null {
  return current
}

export function clearCatalystCoPilot() {
  current = null
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CATALYST_COPILOT_EVENT, { detail: null }))
  }
}

function truncate(s: string, n: number): string {
  const t = s.trim()
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t
}

/**
 * Build the hidden context block prepended to the model query (never shown in
 * the user's message). Caps papers + abstract length so the prompt stays lean.
 */
export function buildCoPilotPreamble(ctx: CoPilotContext): string {
  const lines: string[] = []
  lines.push(
    `You are the user's research co-pilot for a literature search. The user searched: "${ctx.query}".`,
  )
  lines.push(
    'Below are the papers that search surfaced (with abstracts) plus an AI summary of the evidence. ' +
      'Use these together with web search to answer the user. You can discuss ANY of these papers — ' +
      'even without the full PDF — grounding answers in the abstract and what you can verify online. ' +
      'Refer to papers by their number, and say when something is not covered by the abstract.',
  )
  const papers = ctx.papers.slice(0, 8)
  if (papers.length) {
    lines.push('\n## Papers')
    for (const p of papers) {
      const meta = [p.authors, p.journal, p.year ? String(p.year) : '']
        .filter(Boolean)
        .join(' · ')
      lines.push(
        `\n[${p.n}] ${p.title}${meta ? ` — ${meta}` : ''}${p.openAccess ? ' (open access)' : ''}` +
          `${p.url ? `\nLink: ${p.url}` : ''}` +
          `${p.abstract ? `\nAbstract: ${truncate(p.abstract, 700)}` : '\nAbstract: (not available)'}`,
      )
    }
  }
  if (ctx.summary?.trim()) {
    lines.push(`\n## AI summary of the evidence\n${truncate(ctx.summary, 1400)}`)
  }
  return lines.join('\n')
}
