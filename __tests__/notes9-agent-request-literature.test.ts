/**
 * literature_sources wire contract.
 *
 * Locks in the fix for the proxy silently dropping literature grounding:
 * buildNotes9AgentRequestBody must forward literature_sources, and the
 * sanitizer must clamp entries to the backend pydantic caps
 * (AI/catalyst/agents/contracts/request.py LiteratureSource), pydantic
 * REJECTS the whole request on any over-limit field, so the client
 * truncates instead.
 */
import { describe, it, expect } from 'vitest'
import {
  buildNotes9AgentRequestBody,
  sanitizeLiteratureSources,
  type Notes9LiteratureSource,
} from '../lib/notes9-agent-request'

const paper = (over: Partial<Notes9LiteratureSource> = {}): Notes9LiteratureSource => ({
  title: 'CRISPR screening in primary T cells',
  abstract: 'We perform a genome-wide screen…',
  doi: '10.1000/xyz',
  year: 2024,
  ...over,
})

describe('buildNotes9AgentRequestBody literature_sources', () => {
  it('forwards provided sources', () => {
    const body = buildNotes9AgentRequestBody({
      query: 'q',
      session_id: 's',
      literature_sources: [paper()],
    }) as { literature_sources?: Notes9LiteratureSource[] }
    expect(body.literature_sources).toHaveLength(1)
    expect(body.literature_sources?.[0].title).toBe('CRISPR screening in primary T cells')
  })

  it('omits the field when empty or absent', () => {
    const without = buildNotes9AgentRequestBody({ query: 'q', session_id: 's' }) as Record<string, unknown>
    expect(without).not.toHaveProperty('literature_sources')
    const empty = buildNotes9AgentRequestBody({
      query: 'q',
      session_id: 's',
      literature_sources: [],
    }) as Record<string, unknown>
    expect(empty).not.toHaveProperty('literature_sources')
  })

  it('omits the field when every entry is dropped by sanitization', () => {
    const body = buildNotes9AgentRequestBody({
      query: 'q',
      session_id: 's',
      literature_sources: [paper({ title: '   ' })],
    }) as Record<string, unknown>
    expect(body).not.toHaveProperty('literature_sources')
  })
})

describe('sanitizeLiteratureSources', () => {
  it('caps the list at 12 sources (backend MAX_LITERATURE_SOURCES_PER_REQUEST)', () => {
    const out = sanitizeLiteratureSources(Array.from({ length: 20 }, (_, i) => paper({ title: `p${i}` })))
    expect(out).toHaveLength(12)
  })

  it('truncates over-limit fields instead of rejecting', () => {
    const out = sanitizeLiteratureSources([
      paper({
        title: 'T'.repeat(2000),
        abstract: 'A'.repeat(30_000),
        journal: 'J'.repeat(1000),
        doi: 'D'.repeat(500),
        url: `https://example.com/${'u'.repeat(3000)}`,
      }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].title).toHaveLength(1024)
    expect(out[0].abstract).toHaveLength(20_000)
    expect(out[0].journal).toHaveLength(512)
    expect(out[0].doi).toHaveLength(256)
    expect(out[0].url).toHaveLength(2048)
  })

  it('drops entries without a usable title and non-object entries', () => {
    const out = sanitizeLiteratureSources([paper(), { abstract: 'no title' }, null, 'junk', 42])
    expect(out).toHaveLength(1)
  })

  it('drops out-of-range or non-finite years, keeps valid ones', () => {
    const out = sanitizeLiteratureSources([
      paper({ year: 2024 }),
      paper({ title: 'bad year', year: 99999 }),
      paper({ title: 'nan year', year: Number.NaN }),
    ])
    expect(out[0].year).toBe(2024)
    expect(out[1].year).toBeUndefined()
    expect(out[2].year).toBeUndefined()
  })

  it('caps authors at 64 and strips empty names', () => {
    const out = sanitizeLiteratureSources([
      paper({ authors: [...Array.from({ length: 80 }, (_, i) => `Author ${i}`), '   '] }),
    ])
    expect(out[0].authors).toHaveLength(64)
  })

  it('returns [] for non-array input', () => {
    expect(sanitizeLiteratureSources(undefined)).toEqual([])
    expect(sanitizeLiteratureSources({})).toEqual([])
  })
})
