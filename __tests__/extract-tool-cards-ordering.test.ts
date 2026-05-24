import { describe, expect, it } from 'vitest'
import { extractToolCards } from '@/lib/chat-tool-parts'

function makePart(event: string, payload: Record<string, unknown>) {
  return { type: 'data-tool', data: { event, payload } }
}

describe('extractToolCards', () => {
  it('returns [] for non-array input', () => {
    expect(extractToolCards(null)).toEqual([])
    expect(extractToolCards(undefined)).toEqual([])
    expect(extractToolCards('not an array')).toEqual([])
  })

  it('collapses tool_start + tool_result for the same id into one settled card', () => {
    const parts = [
      makePart('tool_start', { tool: 'rag_tool', label: 'Reading notes' }),
      makePart('tool_result', { tool: 'rag_tool', citations_count: 3 }),
    ]
    const cards = extractToolCards(parts)
    expect(cards).toHaveLength(1)
    expect(cards[0].id).toBe('rag_tool')
    expect(cards[0].status).toBe('done')
    expect(cards[0].citations_count).toBe(3)
  })

  it('handles out-of-order events (result before start)', () => {
    const parts = [
      makePart('tool_result', { tool: 'rag_tool', citations_count: 5 }),
      makePart('tool_start', { tool: 'rag_tool', label: 'Reading notes' }),
    ]
    const cards = extractToolCards(parts)
    expect(cards).toHaveLength(1)
    expect(cards[0].status).toBe('done')
    expect(cards[0].citations_count).toBe(5)
  })

  it('treats duplicate tool_start events for the same id as one card', () => {
    const parts = [
      makePart('tool_start', { tool: 'web_search_tool', label: 'Searching' }),
      makePart('tool_start', { tool: 'web_search_tool', label: 'Searching' }),
    ]
    const cards = extractToolCards(parts)
    expect(cards).toHaveLength(1)
  })

  it('marks card as error when quality is error', () => {
    const parts = [
      makePart('tool_start', { tool: 'rag_tool' }),
      makePart('tool_result', { tool: 'rag_tool', quality: 'error' }),
    ]
    const cards = extractToolCards(parts)
    expect(cards[0].status).toBe('error')
  })

  it('preserves insertion order for multiple distinct tools', () => {
    const parts = [
      makePart('tool_start', { tool: 'a' }),
      makePart('tool_start', { tool: 'b' }),
      makePart('tool_start', { tool: 'c' }),
      makePart('tool_result', { tool: 'b' }),
    ]
    const cards = extractToolCards(parts)
    expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('captures source_names from tool_output', () => {
    const parts = [
      makePart('tool_start', { tool: 'rag_tool' }),
      makePart('tool_result', { tool: 'rag_tool' }),
      makePart('tool_output', { tool: 'rag_tool', document_names: ['Paper A', 'Paper B'] }),
    ]
    const cards = extractToolCards(parts)
    expect(cards[0].source_names).toEqual(['Paper A', 'Paper B'])
  })
})
