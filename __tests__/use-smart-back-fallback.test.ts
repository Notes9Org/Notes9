import { describe, expect, it } from 'vitest'
import { decorateFallback } from '@/hooks/use-smart-back'

function makeSearchParams(init: Record<string, string>): URLSearchParams {
  return new URLSearchParams(init)
}

describe('decorateFallback', () => {
  it('appends project param when fallback has none', () => {
    const sp = makeSearchParams({ project: 'p123' }) as unknown as ReturnType<typeof import('next/navigation').useSearchParams>
    expect(decorateFallback('/lab-notes', sp)).toBe('/lab-notes?project=p123')
  })

  it('does not overwrite existing project param on the fallback', () => {
    const sp = makeSearchParams({ project: 'p123' }) as unknown as ReturnType<typeof import('next/navigation').useSearchParams>
    expect(decorateFallback('/lab-notes?project=existing', sp)).toBe('/lab-notes?project=existing')
  })

  it('preserves hash fragment after param injection', () => {
    const sp = makeSearchParams({ project: 'p123' }) as unknown as ReturnType<typeof import('next/navigation').useSearchParams>
    expect(decorateFallback('/path#section', sp)).toBe('/path?project=p123#section')
  })

  it('returns the original fallback when no preserved params are present', () => {
    const sp = makeSearchParams({ unrelated: 'foo' }) as unknown as ReturnType<typeof import('next/navigation').useSearchParams>
    expect(decorateFallback('/lab-notes', sp)).toBe('/lab-notes')
  })

  it('preserves existing unrelated qs while still adding preserved params', () => {
    const sp = makeSearchParams({ project: 'p123' }) as unknown as ReturnType<typeof import('next/navigation').useSearchParams>
    const out = decorateFallback('/lab-notes?foo=bar', sp)
    expect(out).toContain('foo=bar')
    expect(out).toContain('project=p123')
  })
})
