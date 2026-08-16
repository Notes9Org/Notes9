import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  keycapsFor,
  keycapsOf,
  isSequenceFor,
  ariaKeyshortcutsFor,
  shortcutById,
} from '../keycaps'
import { SHORTCUTS } from '../registry'

const MAC = true
const PC = false

describe('keycapsFor — AC-1: the keys shown are the keys that fire', () => {
  it('spells a chord for each platform', () => {
    expect(keycapsFor('palette.open', MAC)).toEqual(['⌘', 'K'])
    expect(keycapsFor('palette.open', PC)).toEqual(['Ctrl', 'K'])
  })

  it('renders a leader sequence as one cap per key, not as a chord', () => {
    const caps = keycapsFor('goto.dashboard', MAC)
    expect(caps).toHaveLength(2)
    expect(caps.every((c) => !c.includes('⌘'))).toBe(true)
    expect(isSequenceFor('goto.dashboard')).toBe(true)
  })

  it('passes literal-character triggers through untouched on both platforms', () => {
    const literal = SHORTCUTS.find((s) => s.display?.length)
    if (!literal) return
    const id = literal.id as Parameters<typeof keycapsFor>[0]
    expect(keycapsFor(id, MAC)).toEqual([...literal.display!])
    expect(keycapsFor(id, PC)).toEqual([...literal.display!])
  })

  it('returns [] — never a blank keycap — when an entry has no keys', () => {
    expect(keycapsOf({ ...shortcutById('palette.open'), keys: [] }, MAC)).toEqual([])
  })

  it('resolves every registry entry on both platforms without throwing', () => {
    for (const s of SHORTCUTS) {
      const id = s.id as Parameters<typeof keycapsFor>[0]
      expect(() => keycapsFor(id, MAC)).not.toThrow()
      expect(() => keycapsFor(id, PC)).not.toThrow()
    }
  })
})

describe('ariaKeyshortcutsFor — AC-3: the accessible contract', () => {
  it('uses DOM key names, not display glyphs', () => {
    expect(ariaKeyshortcutsFor('palette.open', MAC)).toBe('Meta+K')
    expect(ariaKeyshortcutsFor('palette.open', PC)).toBe('Control+K')
  })

  it('never emits a modifier glyph', () => {
    for (const s of SHORTCUTS) {
      const v = ariaKeyshortcutsFor(s.id as Parameters<typeof keycapsFor>[0], MAC)
      if (v) expect(v).not.toMatch(/[⌘⌥⇧⌃]/)
    }
  })

  it('is absent rather than wrong for shortcuts it cannot express', () => {
    // A leader sequence has no aria-keyshortcuts notation.
    expect(ariaKeyshortcutsFor('goto.dashboard', MAC)).toBeUndefined()
    const literal = SHORTCUTS.find((s) => s.display?.length)
    if (literal) {
      expect(
        ariaKeyshortcutsFor(literal.id as Parameters<typeof keycapsFor>[0], MAC),
      ).toBeUndefined()
    }
  })
})

describe('ADR-021 — a rebind cannot leave a stale hint', () => {
  it('keeps ShortcutId a literal union, not string', () => {
    // If a group array is re-annotated `: ShortcutDef[]`, ShortcutId collapses to
    // `string`, every hint call site silently stops being checked, and this line
    // stops being a type error. That is the whole mechanism, so it is asserted
    // here rather than left to review.
    // @ts-expect-error 'definitely-not-a-shortcut' is not a ShortcutId
    expect(() => keycapsFor('definitely-not-a-shortcut', MAC)).toThrow()
  })

  it('has no duplicate ids', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('derives goto ids from the same slug as their href', () => {
    // The id used to be computed with href.replace(), which widened it to
    // `string`. Both are now derived from one slug — this pins the values so the
    // refactor cannot have changed any binding's identity.
    for (const s of SHORTCUTS.filter((s) => s.id.startsWith('goto.'))) {
      expect(s.href).toBe(`/${s.id.slice('goto.'.length)}`)
    }
  })
})

describe('AC-5 — one formatter, no hand-typed glyphs', () => {
  const ALLOWED = [
    'lib/shortcuts',
    'components/ui/kbd.tsx',
    // Static marketing mockups of the app chrome — not real controls, and
    // CLAUDE.md keeps components/marketing out of audits and refactors.
    'components/marketing',
  ]
  const ROOTS = ['app', 'components', 'hooks', 'lib', 'contexts']

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.tsx?$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full)
    }
    return out
  }

  it('has no modifier glyph literal outside the shortcut-display layer', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      let files: string[]
      try {
        files = walk(root)
      } catch {
        continue
      }
      for (const file of files) {
        if (ALLOWED.some((a) => file.includes(a))) continue
        // Prose is fine — the rule is about glyphs that reach the screen. Strip
        // comments before scanning so documenting a binding is not a violation.
        const code = readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
        if (/[⌘⌥⇧]/.test(code)) offenders.push(file)
      }
    }
    // A hardcoded ⌘ is how the sidebar ended up showing the wrong key to every
    // Windows user while surviving any rebind. Render keys through the registry.
    expect(offenders).toEqual([])
  })
})
