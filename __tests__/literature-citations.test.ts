/**
 * Literature → chat citation bridge.
 *
 * Locks in that literature search results map onto the SAME citation contract
 * the Catalyst chat uses (GroundingResource + CitationsManifest), and that a
 * literature summary persisted via formatNotes9AssistantMarkdown round-trips
 * back through parseNotes9AssistantStoredContent with chips intact.
 */
import { describe, it, expect } from 'vitest'
import {
  papersToGrounding,
  buildLiteratureSessionContext,
  literatureContextToSystemMessage,
} from '../lib/literature-citations'
import {
  formatNotes9AssistantMarkdown,
  parseNotes9AssistantStoredContent,
} from '../lib/notes9-chat-format'
import type { AiSearchResult } from '../types/ai-search'
import type { DonePayload } from '../lib/agent-stream-types'

function result(partial: Partial<AiSearchResult>): AiSearchResult {
  return {
    citeLabel: '[1]',
    snippet: 'a relevant snippet',
    aiTitle: null,
    sourceUrl: null,
    paper: null,
    matchKind: 'none',
    abstract: null,
    dedupeKey: 'dk',
    lookupTerm: null,
    lookupById: false,
    abstractPending: false,
    ...partial,
  } as AiSearchResult
}

const RESULTS: AiSearchResult[] = [
  result({
    citeLabel: '[1]',
    dedupeKey: 'doi:10.1/a',
    matchKind: 'doi',
    aiSummary: 'Shows X reduces off-target effects.',
    paper: {
      id: 'p1',
      title: 'Paper One',
      abstract: 'Abstract one about CRISPR.',
      doi: '10.1/a',
      year: 2023,
      journal: 'Nature',
      relevanceScore: 92,
      articlePageUrl: 'https://example.org/p1',
      isOpenAccess: true,
    } as AiSearchResult['paper'],
  }),
  result({
    citeLabel: '[2]',
    dedupeKey: 'pmid:999',
    matchKind: 'pmid',
    snippet: 'second paper snippet',
    paper: {
      id: 'p2',
      title: 'Paper Two',
      abstract: 'Abstract two.',
      pmid: '999',
      year: 2024,
      isOpenAccess: false,
    } as AiSearchResult['paper'],
  }),
]

describe('papersToGrounding', () => {
  it('produces a resource + manifest entry per cited paper, keyed by [N]', () => {
    const { resources, manifest } = papersToGrounding(RESULTS)
    expect(resources).toHaveLength(2)
    expect(Object.keys(manifest.manifest).sort()).toEqual(['1', '2'])

    const r1 = resources.find((r) => r.display_label === '1')!
    expect(r1.source_type).toBe('paper')
    expect(r1.source_name).toBe('Paper One')
    expect(r1.source_url).toBe('https://example.org/p1')
    expect(r1.excerpt).toContain('off-target')

    const m1 = manifest.manifest['1']
    expect(m1.cite_label).toBe('1')
    expect(m1.index).toBe(1)
    expect(m1.source_type).toBe('paper')
    expect(m1.relevance).toBe(92)
    expect(m1.match_kind).toBe('exact')
  })

  it('falls back to DOI/PMID URLs and aiTitle when no page url/title', () => {
    const { manifest } = papersToGrounding(RESULTS)
    expect(manifest.manifest['2'].source_url).toBe('https://pubmed.ncbi.nlm.nih.gov/999/')
  })

  it('normalizes sub-citation labels and skips unlabeled results', () => {
    const { manifest } = papersToGrounding([
      result({ citeLabel: '[3.2]', dedupeKey: 'x', paper: null, aiTitle: 'Sub paper' }),
      result({ citeLabel: '', dedupeKey: 'y' }),
    ])
    expect(Object.keys(manifest.manifest)).toEqual(['3.2'])
  })

  it('is empty-safe', () => {
    expect(papersToGrounding(null).resources).toEqual([])
    expect(papersToGrounding(undefined).manifest.manifest).toEqual({})
  })
})

describe('buildLiteratureSessionContext / system message', () => {
  it('captures query + capped papers with trimmed abstracts', () => {
    const ctx = buildLiteratureSessionContext('crispr off-target', RESULTS)
    expect(ctx.query).toBe('crispr off-target')
    expect(ctx.papers).toHaveLength(2)
    expect(ctx.papers[0]).toMatchObject({ label: '1', title: 'Paper One', doi: '10.1/a', year: 2023 })
  })

  it('renders a grounding system message referencing [N] papers', () => {
    const ctx = buildLiteratureSessionContext('crispr off-target', RESULTS)
    const msg = literatureContextToSystemMessage(ctx)
    expect(msg).toContain('crispr off-target')
    expect(msg).toContain('[1] Paper One')
    expect(msg).toContain('[2] Paper Two')
  })

  it('empty context yields empty system message', () => {
    expect(literatureContextToSystemMessage({ query: 'q', papers: [] })).toBe('')
  })
})

describe('round-trip through notes9 chat format', () => {
  it('persists a literature summary and parses back body + resources + manifest', () => {
    const summary = 'X reduces off-target effects [1], confirmed independently [2].'
    const { resources, manifest } = papersToGrounding(RESULTS)
    const donePayload = {
      role: 'assistant',
      content: summary,
      resources,
      tool_used: 'literature',
    } as unknown as DonePayload

    const stored = formatNotes9AssistantMarkdown(donePayload, manifest)
    const parsed = parseNotes9AssistantStoredContent(stored)

    expect(parsed.bodyMarkdown).toContain('X reduces off-target effects [1]')
    expect(parsed.resources).toHaveLength(2)
    expect(parsed.citationsManifest?.manifest['1']?.source_name).toBe('Paper One')
  })
})
