/**
 * Fold `data-tool` parts from the AI SDK message stream back into the same
 * `ToolCard[]` shape that `useAgentStream` produces for the full-page surface.
 *
 * The modal chat (`components/catalyst/chat.tsx`) consumes the unified AI SDK
 * stream — every tool lifecycle event (`tool_start` / `tool_call` /
 * `tool_result` / `tool_output`) is forwarded by `app/api/chat/route.ts` as a
 * single `data-tool` part. This helper reduces the part list into ordered,
 * settled tool cards so the modal can render the same Cursor/Claude-style
 * inline tool blocks as the full-page agent stream.
 */

import type { ToolCard } from '@/hooks/use-agent-stream';

interface ToolPartData {
  event?: string;
  payload?: Record<string, unknown>;
}

interface MessagePart {
  type?: string;
  data?: ToolPartData;
}

/** Legacy fallback labels — server always supplies one but kept for safety. */
const TOOL_LABELS: Record<string, string> = {
  nlp_to_sql_tool:        'Looking through your workspace',
  rag_tool:               'Reading your notes and documents',
  web_search_tool:        'Checking external sources',
  full_record_fetch_tool: 'Opening a document',
  document_analysis_tool: 'Analyzing literature',
  biomni_tool:            'Drafting an experiment design',
  biomni_full_tool:       'Drafting an experiment design',
  llm_chat_tool:          'Thinking',
  extract_data_tool:      'Pulling out the relevant data',
  episodic_memory_tool:   'Checking past sessions',
};

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string');
  return out.length > 0 ? out : undefined;
}

/**
 * Reduce a message's parts into ToolCard[] in the order the agent fired them.
 * Tool identity is the `tool` field on each payload — same id collapses to one
 * card whose state advances through start → result/output.
 */
export function extractToolCards(parts: unknown): ToolCard[] {
  if (!Array.isArray(parts)) return [];
  const order: string[] = [];
  const byId = new Map<string, ToolCard>();

  for (const raw of parts as MessagePart[]) {
    if (!raw || raw.type !== 'data-tool' || !raw.data) continue;
    const event = raw.data.event;
    const p = raw.data.payload;
    if (!p || typeof p !== 'object') continue;

    const id = asString(p.tool) || 'unknown';
    const serverLabel = asString(p.label);
    const quality = asString(p.quality);
    const statusFromPayload = asString(p.status);

    if (!byId.has(id)) {
      order.push(id);
      byId.set(id, {
        id,
        label: serverLabel || TOOL_LABELS[id] || id,
        status: 'running',
      });
    }
    const card = byId.get(id)!;

    if (event === 'tool_start') {
      // Initial running card. Capture args preview if present.
      card.label = serverLabel || card.label;
      card.args_preview = asString(p.args_preview) ?? card.args_preview;
      // Don't downgrade a settled card if the start event arrives late.
      if (card.status === 'running') card.status = 'running';
    } else if (event === 'tool_call' || event === 'tool_result') {
      const settled: ToolCard['status'] =
        quality === 'error' || statusFromPayload === 'error' ? 'error' : 'done';
      card.status = settled;
      card.label = serverLabel || card.label;
      card.citations_count = asNumber(p.citations_count) ?? card.citations_count;
      card.latency_ms = asNumber(p.latency_ms) ?? card.latency_ms;
      card.summary = asString(p.preview) ?? card.summary;
      const names = asStringArray(p.source_names);
      if (names) card.source_names = names;
    } else if (event === 'tool_output') {
      const docs = asStringArray(p.document_names);
      if (docs) card.source_names = docs;
      const rows = asNumber(p.row_count);
      if (rows != null) card.row_count = rows;
    }
  }

  return order.map((id) => byId.get(id)!).filter(Boolean);
}
