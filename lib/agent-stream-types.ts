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
  excerpt: string;
  relevance: number;
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

/** SSE event: done – final response (same shape as /agent/run citations) */
export interface Citation {
  source_type: string;
  source_id?: string;
  source_name?: string;
  display_label?: string;
  chunk_id?: string | null;
  relevance: number;
  excerpt?: string | null;
}

export interface DonePayload {
  answer: string;
  citations: Citation[];
  confidence: number;
  tool_used: 'sql' | 'rag' | 'hybrid' | 'none';
  debug?: Record<string, unknown> | null;
}

/** SSE event: error */
export interface ErrorPayload {
  error: string;
}

/** SSE event: ping – keep-alive */
export interface PingPayload {
  ts: number;
}
