/**
 * Shared finalization for Notes9-style SSE streams: token deltas and filling
 * assistant body when `done`/`result` omitted text but tokens streamed.
 */

export function extractSseTokenPiece(payload: Record<string, unknown> | null): string {
  if (!payload) return '';
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
