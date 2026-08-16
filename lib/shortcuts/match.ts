/**
 * Combo parsing, event matching, and display formatting for shortcuts.
 *
 * Pure functions only — no React, no DOM globals at module scope — so the
 * matching rules are unit-testable without mounting anything.
 */

export type ParsedCombo = {
  /** Normalized key: lowercase `event.key`, with ' ' mapped to 'space'. */
  key: string
  /** Cmd on macOS, Ctrl elsewhere. */
  mod: boolean
  shift: boolean
  alt: boolean
}

/** Elements that mean "the user is typing" — checked with closest(), not tagName. */
const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

const KEY_GLYPHS: Record<string, string> = {
  escape: 'Esc',
  enter: '↵',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  backspace: '⌫',
  delete: 'Del',
  tab: 'Tab',
  space: 'Space',
};

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const source =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    '';
  return /mac|iphone|ipad|ipod/i.test(source);
}

export function parseCombo(combo: string): ParsedCombo {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    key: parts[parts.length - 1] ?? '',
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

export function normalizeEventKey(key: string): string {
  if (!key) return '';
  if (key === ' ' || key === 'spacebar') return 'space';
  return key.toLowerCase();
}

/**
 * True when the keydown satisfies `combo`.
 *
 * Modifiers must match exactly, so `mod+k` never fires on `mod+shift+k`, and
 * the opposite platform modifier (Ctrl on macOS) must be up so a Ctrl chord is
 * never mistaken for a Cmd one.
 */
export function matchesCombo(
  event: Pick<
    KeyboardEvent,
    'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
  >,
  combo: string,
  isMac: boolean,
): boolean {
  const target = parseCombo(combo);
  const modPressed = isMac ? event.metaKey : event.ctrlKey;
  const otherModPressed = isMac ? event.ctrlKey : event.metaKey;

  if (target.mod !== modPressed) return false;
  if (otherModPressed) return false;
  if (target.alt !== event.altKey) return false;

  // For punctuation the character already encodes Shift ('?' IS Shift+'/'),
  // so comparing shiftKey would make such combos unmatchable.
  const shiftIsImplicit = target.key.length === 1 && !/[a-z0-9]/.test(target.key);
  if (!shiftIsImplicit && target.shift !== event.shiftKey) return false;

  return normalizeEventKey(event.key) === target.key;
}

/**
 * Whether focus is somewhere the user is typing.
 *
 * Uses closest() rather than a tagName check so a nested node inside a
 * contenteditable still counts — the gap in the pre-registry Cmd+K guard,
 * which let the shortcut fire from wrapper elements inside the editor.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  return (target as Element).closest(TYPING_SELECTOR) !== null;
}

/** Keycap tokens for rendering, e.g. `['⌘', '⇧', 'A']` or `['Ctrl', 'Shift', 'A']`. */
export function formatCombo(combo: string, isMac: boolean): string[] {
  const parsed = parseCombo(combo);
  const tokens: string[] = [];
  if (parsed.mod) tokens.push(isMac ? '⌘' : 'Ctrl');
  if (parsed.shift) tokens.push(isMac ? '⇧' : 'Shift');
  if (parsed.alt) tokens.push(isMac ? '⌥' : 'Alt');

  const glyph = KEY_GLYPHS[parsed.key];
  if (glyph) tokens.push(glyph);
  else if (parsed.key.length === 1) tokens.push(parsed.key.toUpperCase());
  else tokens.push(parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1));

  return tokens;
}

/** A leader sequence is two or more successive plain keys, e.g. `g` then `d`. */
export function isSequence(keys: readonly string[]): boolean {
  return keys.length > 1;
}
