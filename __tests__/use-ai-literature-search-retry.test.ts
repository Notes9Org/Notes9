/**
 * "Try again" after a backend-emitted SSE `error` event.
 *
 * The backend streams an `error` event and closes the stream WITHOUT throwing,
 * so the hook's catch block never runs. Before the fix, that left the
 * same-query dedupe guard set (so the error banner's "Try again" was a no-op)
 * and cached the partial result (so even a re-run would replay the broken
 * state). These tests lock in: error surfaced, retry re-fetches, no caching.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiLiteratureSearch } from '../hooks/use-ai-literature-search'

function sseResponse(blocks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const b of blocks) controller.enqueue(enc.encode(`${b}\n\n`))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const papersBlock = (titles: string[]) =>
  `event: papers\ndata: ${JSON.stringify({ papers: titles.map((t, i) => ({ id: String(i + 1), title: t })) })}`
const errorBlock = (msg: string) => `event: error\ndata: ${JSON.stringify({ error: msg })}`
const summaryBlock = (text: string) => `event: overall_summary\ndata: ${JSON.stringify({ text })}`

beforeEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('useAiLiteratureSearch retry after SSE error event', () => {
  it('surfaces the error and lets "Try again" re-run the SAME query', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sseResponse([papersBlock(['P1']), errorBlock('summarizer failed')]))
      .mockResolvedValueOnce(sseResponse([papersBlock(['P1']), summaryBlock('All good now.')]))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAiLiteratureSearch())

    await act(async () => {
      await result.current.run('retry-same-query test')
    })
    await waitFor(() => expect(result.current.error).toBe('summarizer failed'))

    // The reported bug: this second run() with the identical query was
    // swallowed by the dedupe guard, so the button did nothing.
    await act(async () => {
      await result.current.run('retry-same-query test')
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await waitFor(() => {
      expect(result.current.error).toBeNull()
      expect(result.current.summary).toBe('All good now.')
    })
  })

  it('does not cache a failed run (retry re-fetches instead of replaying the broken state)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sseResponse([papersBlock(['P1', 'P2']), errorBlock('boom')]))
      .mockResolvedValueOnce(sseResponse([papersBlock(['P1', 'P2']), summaryBlock('Recovered.')]))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAiLiteratureSearch())
    await act(async () => {
      await result.current.run('no-cache-on-error test')
    })
    // Nothing persisted for the failed run.
    expect(sessionStorage.length).toBe(0)

    await act(async () => {
      await result.current.run('no-cache-on-error test')
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(result.current.summary).toBe('Recovered.'))
  })

  it('still caches and dedupes successful runs (guard/caching behavior unchanged)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(sseResponse([papersBlock(['P1']), summaryBlock('Done.')]))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAiLiteratureSearch())
    await act(async () => {
      await result.current.run('success-dedupe test')
    })
    await waitFor(() => expect(result.current.summary).toBe('Done.'))

    await act(async () => {
      await result.current.run('success-dedupe test')
    })
    // Same query while current → guard short-circuits, no second network call.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
