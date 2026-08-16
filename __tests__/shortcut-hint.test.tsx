/**
 * Render tests for the shortcut hint.
 *
 * These exist because their absence shipped a real defect: `aria-hidden` was
 * passed to `KbdRow`, accepted by the type checker, and silently dropped at
 * runtime, so every keycap was announced to screen readers as symbol names —
 * the exact thing ADR-022 exists to prevent. Forty-three tests over the pure
 * formatter could not see it. Only rendering can.
 *
 * NOTE ON LOCATION: this file must live under `__tests__/`. `vitest.config`
 * includes `lib/**\/*.test.ts` — not `.tsx` — so a component test placed beside
 * the component it covers does not run and does not warn.
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// The provider deliberately corrects `initialIsMac` against the real platform
// after mount, and jsdom is not a Mac — so the seed alone cannot drive a macOS
// assertion. Mock detection instead of the seed; that is the value under test.
let mockIsMac = true
vi.mock('@/lib/shortcuts/match', async () => {
  const actual = await vi.importActual<typeof import('@/lib/shortcuts/match')>(
    '@/lib/shortcuts/match',
  )
  return { ...actual, isMacPlatform: () => mockIsMac }
})

import { ShortcutHint } from '@/components/shortcuts/shortcut-hint'
import { PlatformProvider } from '@/components/providers/platform-provider'
import { KbdRow } from '@/components/ui/kbd'

function renderHint(ui: React.ReactNode, { isMac = true } = {}) {
  mockIsMac = isMac
  return render(<PlatformProvider initialIsMac={isMac}>{ui}</PlatformProvider>)
}

describe('AC-3 — keycaps are decorative, the control carries the contract', () => {
  it('hides the keycap run from the accessibility tree', () => {
    const { container } = renderHint(<ShortcutHint id="palette.open" />)
    const row = container.querySelector('span')
    expect(row).not.toBeNull()
    expect(row?.getAttribute('aria-hidden')).toBe('true')
  })

  it('forwards arbitrary span props through KbdRow', () => {
    // The primitive silently swallowed everything it did not name. Pin it.
    const { container } = render(
      <KbdRow tokens={['⌘', 'K']} aria-hidden="true" data-testid="row" />,
    )
    const row = container.querySelector('span')
    expect(row?.getAttribute('aria-hidden')).toBe('true')
    expect(row?.getAttribute('data-testid')).toBe('row')
  })

  it('still renders the keys visually while hiding them from AT', () => {
    // Scoped to this container, not `screen` — hiding from the accessibility
    // tree must not mean hiding from sighted users, and that distinction is the
    // whole point of ADR-022.
    const { container } = renderHint(<ShortcutHint id="palette.open" />)
    const caps = [...container.querySelectorAll('kbd')].map((k) => k.textContent)
    expect(caps).toEqual(['⌘', 'K'])
  })
})

describe('AC-1 — the keys shown match the platform', () => {
  it('renders ⌘ on macOS and Ctrl elsewhere from the same id', () => {
    const mac = renderHint(<ShortcutHint id="palette.open" />, { isMac: true })
    expect(mac.container.textContent).toContain('⌘')
    mac.unmount()

    const pc = renderHint(<ShortcutHint id="palette.open" />, { isMac: false })
    expect(pc.container.textContent).toContain('Ctrl')
    expect(pc.container.textContent).not.toContain('⌘')
  })
})

describe('AC-8 (negative) — nothing rather than an empty chip', () => {
  it('positive control: a bound shortcut does render', () => {
    // Named for what it actually is. Without it, the "renders nothing" test
    // below would pass just as happily if ShortcutHint were broken and rendered
    // nothing for everything. The empty-keys path itself is covered where the
    // formatter can be driven directly — see keycaps.test.ts.
    const { container } = renderHint(<ShortcutHint id="composer.send" />)
    expect(container.textContent?.length).toBeGreaterThan(0)
  })

  it('renders nothing when the pointer is coarse (no keyboard to press)', () => {
    const original = window.matchMedia
    // jsdom has no matchMedia by default; emulate a touch-primary device.
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('coarse'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia

    const { container } = renderHint(<ShortcutHint id="palette.open" />)
    expect(container.textContent).toBe('')

    window.matchMedia = original
  })
})
