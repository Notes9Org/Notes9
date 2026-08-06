/**
 * Shared types for the keyboard-shortcut registry.
 *
 * The registry is the single source of truth for BOTH the global key handling
 * and the cheat sheet the researcher reads. Anything documented here is real,
 * and anything real is documented here.
 */

export type ShortcutScope =
  | 'global'
  | 'editor'
  | 'composer'
  | 'canvas'
  | 'analysis'

/**
 * `registry` — the global dispatcher owns this binding and invokes its action.
 * `external` — the key already works via Tiptap, a local handler, or the
 *              browser. Listed so the cheat sheet stays complete; never bound,
 *              so we can never double-handle a key.
 */
export type ShortcutHandling = 'registry' | 'external'

export type ShortcutDef = {
  /** Stable identifier. Doubles as the action key for `registry` entries. */
  id: string
  /**
   * Either a single combo (`['mod+k']`) or a leader sequence (`['g', 'd']`).
   * `mod` resolves to Cmd on macOS and Ctrl elsewhere.
   */
  keys: string[]
  /** Short imperative label, e.g. "Open command palette". */
  label: string
  /** Optional longer copy shown under the label in the cheat sheet. */
  hint?: string
  /** Cheat-sheet section heading. */
  group: string
  scope: ShortcutScope
  handled: ShortcutHandling
  /**
   * Fire even while the user is typing in an input/textarea/contenteditable.
   * Off by default so bare keys and leaders can never hijack typing.
   */
  allowInInput?: boolean
  /** Route pushed by `goto.*` entries. Kept in sync with APP_PRIMARY_NAV by test. */
  href?: string
  /**
   * Literal keycap tokens to render instead of parsing `keys`. Used for
   * documentation-only entries whose trigger isn't a modifier combo
   * (e.g. `@`, `[[`, `\` then `B`).
   */
  display?: string[]
}

export type ShortcutAction = () => void

/** Map of `ShortcutDef.id` -> handler, supplied by the app at mount time. */
export type ShortcutActionMap = Record<string, ShortcutAction | undefined>
