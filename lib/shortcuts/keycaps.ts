/**
 * The one place a registry entry turns into something a human reads.
 *
 * Before this file existed the same `keycaps()` helper was written twice — once
 * privately in the cheat sheet and once, explicitly "mirroring" it, in the
 * command palette — while the sidebar rendered a hardcoded `⌘K` string that was
 * simply wrong on Windows. Every surface that displays a shortcut now goes
 * through here, so a rebind can never leave a stale keycap behind (ADR-021).
 *
 * Everything in this module is pure and platform-agnostic: `isMac` is passed in,
 * never detected. Detection happens once, in the platform provider (ADR-020) —
 * calling it during render is what causes hydration mismatches.
 */

import { SHORTCUTS, type ShortcutId } from './registry'
import { formatCombo, isSequence } from './match'
import type { ShortcutDef } from './types'

const BY_ID: ReadonlyMap<string, ShortcutDef> = new Map(
  SHORTCUTS.map((s) => [s.id, s]),
)

/** The registry entry for an id. Total, because `ShortcutId` is a literal union. */
export function shortcutById(id: ShortcutId): ShortcutDef {
  const def = BY_ID.get(id)
  // Unreachable through the type system; only a runtime registry edit that
  // bypasses `ShortcutId` can get here, and a silent empty hint would hide it.
  if (!def) throw new Error(`Unknown shortcut id: ${id}`)
  return def
}

/**
 * Display keycaps for an entry: `['⌘', 'K']` on macOS, `['Ctrl', 'K']` elsewhere.
 *
 * Returns `[]` when the entry has no keys, which callers render as nothing at
 * all rather than as an empty keycap.
 */
export function keycapsOf(def: ShortcutDef, isMac: boolean): string[] {
  // Documentation-only triggers (`@`, `[[`, `\` then `B`) are literal keycaps,
  // not modifier combos — never run them through the combo parser.
  if (def.display?.length) return [...def.display]
  if (isSequence(def.keys)) {
    return def.keys.map((key) => formatCombo(key, isMac).join(''))
  }
  return def.keys[0] ? formatCombo(def.keys[0], isMac) : []
}

/** `keycapsOf` addressed by id — the form hint call sites use (ADR-021). */
export function keycapsFor(id: ShortcutId, isMac: boolean): string[] {
  return keycapsOf(shortcutById(id), isMac)
}

/**
 * True when the entry is a leader sequence (`G` then `D`) rather than a chord.
 * Callers use it to pick the joiner, so a sequence never looks like keys held
 * down together.
 */
export function isSequenceFor(id: ShortcutId): boolean {
  const def = shortcutById(id)
  if (def.display?.length) return def.display.length > 1
  return isSequence(def.keys)
}

const ID_BY_HREF: ReadonlyMap<string, ShortcutId> = new Map(
  SHORTCUTS.filter((s) => s.href).map((s) => [s.href!, s.id as ShortcutId]),
)

/**
 * The `goto.*` shortcut for a nav href, or `undefined` when that route has none.
 *
 * Nav rows are rendered from a list, so their ids can only be known at runtime —
 * this is the one sanctioned way to reach a `ShortcutId` from a value rather
 * than a literal, and it still cannot invent one: an unmapped href returns
 * `undefined` and the caller renders no hint.
 */
export function shortcutIdForHref(href: string): ShortcutId | undefined {
  return ID_BY_HREF.get(href)
}

/** `aria-keyshortcuts` token names. Not the display glyphs — see ADR-022. */
const ARIA_MODIFIER: Record<string, string> = {
  mod: 'Meta', // overridden to Control off macOS
  cmd: 'Meta',
  meta: 'Meta',
  ctrl: 'Control',
  control: 'Control',
  alt: 'Alt',
  opt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
}

/** `aria-keyshortcuts` spells named keys out; single characters are uppercased. */
const ARIA_KEY: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  space: 'Space',
  tab: 'Tab',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  '/': 'Slash',
  ',': 'Comma',
  '.': 'Period',
}

/**
 * The value for the control's `aria-keyshortcuts` attribute, e.g. `"Meta+K"`.
 *
 * This is the accessible contract, not the visual one: the keycaps are hidden
 * from the accessibility tree because `⌘` announces as "place of interest sign"
 * (ADR-022), and this attribute carries the real information instead. It has its
 * own grammar — `+`-joined chords using DOM key names — so it deliberately does
 * not reuse `formatCombo`.
 *
 * Returns `undefined` when the shortcut cannot be expressed: leader sequences
 * (the attribute has no notation for "G then D") and literal-character triggers
 * such as `@` or `[[`. An absent attribute is correct there; a wrong one is not.
 */
export function ariaKeyshortcutsFor(
  id: ShortcutId,
  isMac: boolean,
): string | undefined {
  const def = shortcutById(id)
  if (def.display?.length) return undefined
  if (isSequence(def.keys)) return undefined

  const combo = def.keys[0]
  if (!combo) return undefined

  const parts = combo.split('+').map((p) => p.trim().toLowerCase())
  const tokens = parts.map((part) => {
    if (part === 'mod') return isMac ? 'Meta' : 'Control'
    const modifier = ARIA_MODIFIER[part]
    if (modifier) return modifier
    const named = ARIA_KEY[part]
    if (named) return named
    return part.length === 1 ? part.toUpperCase() : part
  })

  return tokens.join('+')
}
