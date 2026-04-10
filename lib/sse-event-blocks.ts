/**
 * Incremental SSE parser: split on blank line, read `event:` / `data:` lines per block.
 */

export type SseEventBlock = {
  event: string;
  data: string;
};

/** Split completed blocks from buffer; `rest` is incomplete trailing data. */
export function splitSseBuffer(buffer: string): { blocks: SseEventBlock[]; rest: string } {
  const segments = buffer.split('\n\n');
  const rest = segments.pop() ?? '';
  const blocks: SseEventBlock[] = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of segment.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    blocks.push({
      event: eventName,
      data: dataLines.join('\n'),
    });
  }

  return { blocks, rest };
}

export function parseSseDataJson(data: string): Record<string, unknown> | null {
  const s = data.trim();
  if (!s) return null;
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
