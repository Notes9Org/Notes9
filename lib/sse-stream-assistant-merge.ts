/**
 * Shared finalization for Notes9-style SSE streams: token deltas and filling
 * assistant body when `done`/`result` omitted text but tokens streamed.
 */

/** Hide raw Option C cite tokens during live stream; done payload replaces with [N]. */
export const CITE_TOKEN_STREAM_RE =
  /\[(?:[a-z]{3}_[0-9a-f]{4,8})(?:\s*,\s*[a-z]{3}_[0-9a-f]{4,8})*\]/gi;

/**
 * Hide raw `[lab_969438]`-style cite tokens while text is streaming.
 *
 * Whitespace-preserving by design: this runs once per streamed delta, so it
 * must NOT collapse or strip whitespace. Trimming/collapsing per delta removes
 * the leading/trailing space of every token and glues words at delta
 * boundaries ("read" + "all" -> "readall") and destroys the blank-line / `## `
 * block structure markdown needs. We only remove complete inline tokens,
 * replacing each with a single space so "studies[lab_a1b2]show" doesn't become
 * "studiesshow". Any resulting double space is invisible in rendered HTML and
 * absent from the clean final answer the `done` payload swaps in.
 */
export function maskCiteTokensForStream(text: string): string {
  return text.replace(CITE_TOKEN_STREAM_RE, ' ');
}

/**
 * Stateful masker that handles cite tokens split across SSE delta boundaries.
 * Create one instance per stream run; call the returned function for each delta.
 * A trailing fragment that looks like the opening of a cite token is held back
 * until the next delta confirms or disproves it.
 */
// A complete cite token is "[" + 3 letters + "_" + up to 8 hex = 13 chars.
// Any trailing "[..." fragment longer than this cannot become a cite token,
// so we stop holding it back (guards against pinning huge non-cite brackets).
const MAX_CITE_TOKEN_LEN = 13;

export function createStreamCiteMasker(): (delta: string) => string {
  let tail = '';
  return (delta: string): string => {
    const input = tail + delta;
    // Look for a trailing fragment that COULD be the start of a cite token but
    // is incomplete (no closing "]" yet). If found, hold it for the next call.
    const partial = input.match(/\[[a-z]{0,3}(?:_[0-9a-f]{0,8})?$/i);
    if (partial && partial[0].length <= MAX_CITE_TOKEN_LEN) {
      tail = partial[0];
      return input.slice(0, input.length - tail.length).replace(CITE_TOKEN_STREAM_RE, ' ');
    }
    tail = '';
    return input.replace(CITE_TOKEN_STREAM_RE, ' ');
  };
}

export function extractSseTokenPiece(payload: Record<string, unknown> | null): string {
  if (!payload) return '';
  // Support every shape any backend has ever emitted for a streamed text
  // chunk. The core agent emits `{ delta: "..." }` (matches Anthropic's own
  // SSE convention); the legacy pipeline emitted `text` or `token`. We
  // accept all three rather than locking into one — adding a fourth shape
  // tomorrow is a one-line extension here, no backend coordination needed.
  if (typeof payload.delta === 'string') return payload.delta;
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.token === 'string') return payload.token;
  return '';
}

/**
 * Merge streamed token text into a partial assistant JSON shape.
 * Does not overwrite non-empty `content` / `answer` from prior `result`/`done`.
 */
export function mergeTokenBufferIntoAssistantRaw(
  prior: Record<string, unknown> | null,
  tokenBuffer: string
): Record<string, unknown> | null {
  const streamed = tokenBuffer.trim();
  if (!streamed) return prior;

  if (!prior) {
    return { role: 'assistant', content: streamed, answer: streamed };
  }

  const existing =
    (typeof prior.content === 'string' && prior.content.trim()) ||
    (typeof prior.answer === 'string' && prior.answer.trim());
  if (existing) return prior;

  return { ...prior, content: streamed, answer: streamed };
}
