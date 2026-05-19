/**
 * Strip leading emoji / pictograph / symbol characters from a display title.
 *
 * Users sometimes save entity names like "🧬 Protein Production Using HEK Cells".
 * The product convention is professional / tech-heavy: render the title without
 * the decorative prefix and let the surrounding lucide icon carry the visual.
 *
 * Only the LEADING run of emoji/symbol characters is stripped; punctuation
 * inside the title is preserved.
 */
const LEADING_EMOJI_RE =
  /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}️‍]|\s)+/u;

export function formatEntityTitle(input?: string | null): string {
  if (!input) return '';
  return input.replace(LEADING_EMOJI_RE, '').trim();
}
