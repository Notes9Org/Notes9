/**
 * Deterministic citation renumbering.
 *
 * The agent (literature summary + Catalyst chat) emits inline citation markers
 * like `[5]`, `[12]` or grouped `[4, 5, 6]`, using whatever source ids it was
 * given. Those ids are sparse and arrival-ordered, so they never line up with
 * the rendered sources list (which is positional). Numbering is a *mechanical*
 * concern, not the model's job: we renumber by **order of first appearance** in
 * the text — the first cited source becomes `[1]`, the next new one `[2]`, … —
 * and rewrite both the inline markers and (via the returned remap) the sources
 * list / manifest to match.
 *
 * Pure and framework-free so it runs identically on the server (persisted chat
 * turns) and the client (the live-streaming literature summary). Renumbering is
 * prefix-stable (a label's first appearance never moves earlier as more text
 * streams in) and idempotent (already-contiguous input is returned unchanged).
 */

/** A single citation token: a base number with an optional `.sub` (e.g. `6.2`). */
const TOKEN = String.raw`\d{1,3}(?:\.\d{1,3})?`

/**
 * Matches a citation marker: a single token or a comma-separated group, e.g.
 * `[5]`, `[6.2]`, `[4, 5, 6]`. Capture group 1 is the inner token list.
 */
export const CITATION_GROUP_RE = new RegExp(
  String.raw`\[(${TOKEN}(?:\s*,\s*${TOKEN})*)\]`,
  'g',
)

/** Split a marker's inner text into trimmed tokens (`"4, 5"` → `["4","5"]`). */
function splitTokens(inner: string): string[] {
  return inner
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Base label of a token: the part before any `.sub` (`"6.2"` → `"6"`). */
function baseOf(token: string): string {
  const dot = token.indexOf('.')
  return dot === -1 ? token : token.slice(0, dot)
}

/** Sub-label of a token, or `''` (`"6.2"` → `"2"`, `"6"` → `""`). */
function subOf(token: string): string {
  const dot = token.indexOf('.')
  return dot === -1 ? '' : token.slice(dot + 1)
}

/**
 * Base labels in order of first appearance. When `knownLabels` is provided,
 * only labels with a matching source are counted (so stray `[99]` that has no
 * source doesn't consume a number).
 */
export function collectAppearanceOrder(
  markdown: string,
  knownLabels?: ReadonlySet<string>,
): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  if (!markdown) return order
  // RegExp is stateful (global) — use a local copy to stay reentrant.
  const re = new RegExp(CITATION_GROUP_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    for (const token of splitTokens(m[1])) {
      const base = baseOf(token)
      if (seen.has(base)) continue
      if (knownLabels && !knownLabels.has(base)) continue
      seen.add(base)
      order.push(base)
    }
  }
  return order
}

/** Remap a full token label (preserving any `.sub`) through a base remap. */
export function applyRemapToLabel(
  label: string,
  remap: ReadonlyMap<string, string>,
): string {
  const base = baseOf(label)
  const next = remap.get(base)
  if (next === undefined) return label
  const sub = subOf(label)
  return sub ? `${next}.${sub}` : next
}

export interface RenumberResult {
  /** The markdown with every citation marker rewritten to the new numbering. */
  markdown: string
  /** Old base label → new base label (`"5"` → `"2"`). Identity when unchanged. */
  remap: Map<string, string>
  /** Old base labels in first-appearance order (index 0 → new label `"1"`). */
  order: string[]
}

/**
 * Renumber every citation marker in `markdown` by first appearance.
 *
 * @param knownLabels base labels that have a backing source. Markers whose base
 *   isn't known are left untouched (and don't consume a number). Omit to
 *   renumber every label found.
 */
export function renumberCitations(
  markdown: string,
  knownLabels?: ReadonlySet<string>,
): RenumberResult {
  const order = collectAppearanceOrder(markdown, knownLabels)
  const remap = new Map<string, string>()
  order.forEach((base, i) => remap.set(base, String(i + 1)))

  if (!markdown || remap.size === 0) {
    return { markdown: markdown ?? '', remap, order }
  }

  const re = new RegExp(CITATION_GROUP_RE.source, 'g')
  const rewritten = markdown.replace(re, (full, inner: string) => {
    const mapped = splitTokens(inner)
      .map((token) => (remap.has(baseOf(token)) ? applyRemapToLabel(token, remap) : null))
      .filter((t): t is string => t !== null)
    // No mappable tokens (all unknown) — leave the original marker as-is.
    if (mapped.length === 0) return full
    // Stable, readable order: ascending by new numeric value.
    mapped.sort((a, b) => parseFloat(a) - parseFloat(b))
    return `[${mapped.join(', ')}]`
  })

  return { markdown: rewritten, remap, order }
}
