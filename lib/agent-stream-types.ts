/** SSE event: thinking – agent step (e.g. "Calling SQL", "Calling RAG") */
export interface ThinkingPayload {
  node: string;
  status: string;
  message: string;
  intent?: string;
  conclusion?: string;
  decision?: string;
  rationale?: string;
  confidence?: number;
  sql?: string;
  verdict?: string;
  issues?: string[];
}

/** SSE event: sql – SQL query from agent */
export interface SqlPayload {
  query: string;
}

/** SSE event: rag_chunks – retrieved document chunks */
export interface RagChunk {
  source_type: string;
  source_id: string;
  source_name?: string;
  chunk_id?: string | null;
  page_number?: number | null;
  excerpt: string;
  relevance: number;
  /** e.g. abstract vs pdf — drives literature deep-link tab + highlight surface */
  content_surface?: string | null;
}

export interface RagChunksPayload {
  message: string;
  count: number;
  chunks: RagChunk[];
}

/** SSE event: token – streaming answer chunk */
export interface TokenPayload {
  text: string;
}

/** Grounding item: POST /notes9 returns `resources[]` (aligned with POST /chat). */
export interface GroundingResource {
  display_label?: string | null;
  source_type: string;
  source_name?: string | null;
  relevance?: number;
  excerpt?: string | null;
  source_id?: string | null;
  chunk_id?: string | null;
  page_number?: number | null;
  content_surface?: string | null;
  /** External URL when the source has one — e.g. the actual web page for a
   * `web` citation, or the signed PDF URL for a literature review. Workspace
   * records (lab notes, protocols, etc.) leave this empty and rely on the
   * internal route from `getCitationRoute` instead. */
  source_url?: string | null;
  /** Where the excerpt came from inside the source — e.g. `pdf_extracted_text`,
   * `abstract`. Display-only hint; safe to ignore. */
  excerpt_source?: string | null;
}

/** @deprecated Use GroundingResource; kept for imports that still say Citation */
export type Citation = GroundingResource;

/** Final agent response (POST /notes9 non-stream and SSE `done` when streaming is enabled upstream). */
export interface DonePayload {
  role?: string;
  /** Primary answer text (same key as POST /chat). */
  content: string;
  /** Alias for legacy clients; mirrors `content` when normalized on the client. */
  answer?: string;
  resources?: GroundingResource[];
  /** Legacy / streaming shape; prefer `resources`. */
  citations?: GroundingResource[];
  confidence?: number;
  /** Free-text label describing what the agent did this turn (display only). */
  tool_used?: string;
  debug?: Record<string, unknown> | null;
}

/** SSE event: tool_output – Individual tool completion details */
export interface ToolOutputPayload {
  tool: 'sql' | 'rag' | 'web_search' | string;
  success: boolean;
  row_count?: number;
  chunk_count?: number;
  file_names?: string[];
  document_names?: string[];
  execution_time_ms?: number;
  avg_similarity?: number;
}

/** SSE event: error */
export interface ErrorPayload {
  error: string;
}

/** SSE event: ping – keep-alive */
export interface PingPayload {
  ts: number;
}
