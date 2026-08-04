import { describe, expect, it } from 'vitest'
import {
  encodeHighlightParam,
  decodeHighlightParam,
  buildHighlightUrl,
  type HighlightTarget,
} from '@/lib/document-highlight'

describe('document-highlight roundtrip', () => {
  it('round-trips ASCII excerpts', () => {
    const target: HighlightTarget = {
      sourceType: 'lab_note',
      sourceId: 'note-1',
      excerpt: 'The reaction yielded 42mg of product.',
    }
    const encoded = encodeHighlightParam(target)
    const decoded = decodeHighlightParam(encoded)
    expect(decoded?.sourceType).toBe('lab_note')
    expect(decoded?.sourceId).toBe('note-1')
    expect(decoded?.excerpt).toBe(target.excerpt)
  })

  it('round-trips Unicode (Greek, Chinese, emoji)', () => {
    const target: HighlightTarget = {
      sourceType: 'protocol',
      sourceId: 'p-1',
      excerpt: 'α β γ, 蛋白质, 🧪',
    }
    const encoded = encodeHighlightParam(target)
    const decoded = decodeHighlightParam(encoded)
    expect(decoded?.excerpt).toBe(target.excerpt)
  })

  it('round-trips excerpts with newlines and quotes', () => {
    const target: HighlightTarget = {
      sourceType: 'protocol',
      sourceId: 'p-2',
      excerpt: 'Line 1\nLine 2 with "quoted" text',
    }
    const decoded = decodeHighlightParam(encodeHighlightParam(target))
    expect(decoded?.excerpt).toBe(target.excerpt)
  })

  it('round-trips long excerpts (~2KB)', () => {
    const target: HighlightTarget = {
      sourceType: 'literature_review',
      sourceId: 'lit-1',
      excerpt: 'A '.repeat(1000),
      contentSurface: 'pdf',
    }
    const decoded = decodeHighlightParam(encodeHighlightParam(target))
    expect(decoded?.excerpt).toBe(target.excerpt)
    expect(decoded?.contentSurface).toBe('pdf')
  })

  it('returns null for invalid base64', () => {
    expect(decodeHighlightParam('!!!not-base64!!!')).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    const encoded =
      typeof window !== 'undefined'
        ? btoa(JSON.stringify({ st: 'lab_note' }))
        : Buffer.from(JSON.stringify({ st: 'lab_note' }), 'utf-8').toString('base64')
    expect(decodeHighlightParam(encoded)).toBeNull()
  })

  // Per-click nonce (hooks/use-source-navigation.ts): makes a repeat click on
  // the SAME citation value-distinct across both delivery paths so downstream
  // content-keyed dedup gates (e.g. the PDF panel's fired-ref) reset per click.
  it('round-trips a nonce', () => {
    const target: HighlightTarget = {
      sourceType: 'lab_note',
      sourceId: 'note-1',
      excerpt: 'The reaction yielded 42mg of product.',
      nonce: 7,
    }
    const decoded = decodeHighlightParam(encodeHighlightParam(target))
    expect(decoded?.nonce).toBe(7)
  })

  it('produces a different param string for two different nonces (same excerpt)', () => {
    const base: HighlightTarget = {
      sourceType: 'lab_note',
      sourceId: 'note-1',
      excerpt: 'identical excerpt text',
    }
    const encoded1 = encodeHighlightParam({ ...base, nonce: 1 })
    const encoded2 = encodeHighlightParam({ ...base, nonce: 2 })
    expect(encoded1).not.toBe(encoded2)
    expect(decodeHighlightParam(encoded1)?.nonce).toBe(1)
    expect(decodeHighlightParam(encoded2)?.nonce).toBe(2)
  })

  it('decodes a legacy param without `n` with nonce undefined', () => {
    const legacyJson = JSON.stringify({ st: 'lab_note', sid: 'note-1', ex: 'legacy excerpt' })
    const encoded =
      typeof window !== 'undefined'
        ? btoa(legacyJson)
        : Buffer.from(legacyJson, 'utf-8').toString('base64')
    const decoded = decodeHighlightParam(encoded)
    expect(decoded?.excerpt).toBe('legacy excerpt')
    expect(decoded?.nonce).toBeUndefined()
  })
})

describe('buildHighlightUrl routing', () => {
  const baseTarget = { sourceId: 'abc', excerpt: 'hello world' } as const

  it('literature_review with abstract surface routes to overview tab', () => {
    const url = buildHighlightUrl({
      ...baseTarget,
      sourceType: 'literature_review',
      contentSurface: 'abstract',
    })
    expect(url).toContain('/literature-reviews/abc')
    expect(url).toContain('tab=overview')
    expect(url).toContain('highlight=')
  })

  it('literature_review with pdf surface routes to pdf tab', () => {
    const url = buildHighlightUrl({
      ...baseTarget,
      sourceType: 'literature_review',
      contentSurface: 'pdf',
    })
    expect(url).toContain('tab=pdf')
  })

  it('protocol routes to /protocols/[id]', () => {
    const url = buildHighlightUrl({ ...baseTarget, sourceType: 'protocol' })
    expect(url).toContain('/protocols/abc')
    expect(url).toContain('highlight=')
  })

  it('lab_note with experimentId routes to experiments tab', () => {
    const url = buildHighlightUrl(
      { ...baseTarget, sourceType: 'lab_note' },
      { experimentId: 'exp-7' },
    )
    expect(url).toContain('/experiments/exp-7')
    expect(url).toContain('tab=notes')
    expect(url).toContain('noteId=abc')
  })

  it('lab_note without experimentId routes to /lab-notes/[id]', () => {
    const url = buildHighlightUrl({ ...baseTarget, sourceType: 'lab_note' })
    expect(url).toContain('/lab-notes/abc')
    expect(url).toContain('highlight=')
  })

  it('unknown source type returns empty string', () => {
    const url = buildHighlightUrl({ ...baseTarget, sourceType: 'something_else' })
    expect(url).toBe('')
  })
})
