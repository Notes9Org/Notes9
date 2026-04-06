/** Types and normalization for POST /paper-analyzer (compare) JSON responses. */

export type PaperAnalyzerReference = {
  index: number;
  /** Optional when upstream omits the catalog id; inline links are skipped. */
  literature_review_id?: string | null;
  title?: string | null;
  doi?: string | null;
  pmid?: string | null;
  supporting_sentences?: string[];
  note?: string | null;
};

export type PaperAnalyzerSource = {
  /** Optional; sources may still list metadata without a catalog record. */
  literature_review_id?: string | null;
  title?: string | null;
  authors?: string | null;
  journal?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  pmid?: string | null;
  abstract?: string | null;
  catalog_placement?: string | null;
  has_extracted_text?: boolean;
  extracted_text_char_count?: number;
  context_sent_to_model_was_truncated?: boolean;
};

export type LiteratureAgentDonePayload = {
  role: string;
  content: string;
  answer: string;
  session_id?: string;
  structured?: { references?: PaperAnalyzerReference[] };
  /** Legacy paper-analyzer shape; biomni success uses `structured.references` only. */
  sources?: PaperAnalyzerSource[];
  debug?: unknown;
  /** Biomni non-stream JSON when the clarification gate fires. */
  needs_clarification?: boolean;
  clarify_question?: string;
  clarify_options?: string[];
  reasoning_trace?: string[];
};

function normalizeReferences(raw: unknown): PaperAnalyzerReference[] {
  if (!Array.isArray(raw)) return [];
  const out: PaperAnalyzerReference[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const idx = typeof o.index === 'number' ? o.index : Number(o.index);
    const literature_review_id =
      typeof o.literature_review_id === 'string'
        ? o.literature_review_id.trim()
        : o.literature_review_id === null
          ? null
          : undefined;
    if (!Number.isFinite(idx)) continue;
    const sentences = Array.isArray(o.supporting_sentences)
      ? o.supporting_sentences.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
      : [];
    out.push({
      index: idx,
      literature_review_id: literature_review_id || undefined,
      title: typeof o.title === 'string' ? o.title : o.title === null ? null : undefined,
      doi: typeof o.doi === 'string' ? o.doi : o.doi === null ? null : undefined,
      pmid: typeof o.pmid === 'string' ? o.pmid : o.pmid === null ? null : undefined,
      supporting_sentences: sentences,
      note: typeof o.note === 'string' ? o.note : o.note === null ? null : undefined,
    });
  }
  return out;
}

function normalizeSources(raw: unknown): PaperAnalyzerSource[] {
  if (!Array.isArray(raw)) return [];
  const out: PaperAnalyzerSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const literature_review_id =
      typeof o.literature_review_id === 'string'
        ? o.literature_review_id.trim()
        : o.literature_review_id === null
          ? null
          : undefined;
    const t = typeof o.title === 'string' ? o.title.trim() : '';
    const d = typeof o.doi === 'string' ? o.doi.trim() : '';
    const p = typeof o.pmid === 'string' ? o.pmid.trim() : '';
    if (!literature_review_id && !t && !d && !p) continue;
    const pubYear = o.publication_year;
    out.push({
      literature_review_id: literature_review_id || undefined,
      title: typeof o.title === 'string' ? o.title : o.title === null ? null : undefined,
      authors: typeof o.authors === 'string' ? o.authors : o.authors === null ? null : undefined,
      journal: typeof o.journal === 'string' ? o.journal : o.journal === null ? null : undefined,
      publication_year:
        typeof pubYear === 'number' && Number.isFinite(pubYear)
          ? pubYear
          : pubYear === null
            ? null
            : undefined,
      doi: typeof o.doi === 'string' ? o.doi : o.doi === null ? null : undefined,
      pmid: typeof o.pmid === 'string' ? o.pmid : o.pmid === null ? null : undefined,
      abstract: typeof o.abstract === 'string' ? o.abstract : o.abstract === null ? null : undefined,
      catalog_placement:
        typeof o.catalog_placement === 'string'
          ? o.catalog_placement
          : o.catalog_placement === null
            ? null
            : undefined,
      has_extracted_text:
        typeof o.has_extracted_text === 'boolean' ? o.has_extracted_text : undefined,
      extracted_text_char_count:
        typeof o.extracted_text_char_count === 'number' && Number.isFinite(o.extracted_text_char_count)
          ? o.extracted_text_char_count
          : undefined,
      context_sent_to_model_was_truncated:
        typeof o.context_sent_to_model_was_truncated === 'boolean'
          ? o.context_sent_to_model_was_truncated
          : undefined,
    });
  }
  return out;
}

export function normalizeLiteratureAgentResponse(
  raw: Record<string, unknown>
): LiteratureAgentDonePayload {
  const content =
    typeof raw.content === 'string'
      ? raw.content
      : typeof raw.answer === 'string'
        ? raw.answer
        : typeof raw.message === 'string'
          ? raw.message
          : '';
  const role = typeof raw.role === 'string' ? raw.role : 'assistant';
  const session_id = typeof raw.session_id === 'string' ? raw.session_id : undefined;
  const debug = raw.debug;

  const needs_clarification = raw.needs_clarification === true;
  const clarify_question =
    typeof raw.clarify_question === 'string' ? raw.clarify_question : undefined;
  let clarify_options: string[] | undefined;
  if (Array.isArray(raw.clarify_options)) {
    const opts = raw.clarify_options.filter((o): o is string => typeof o === 'string');
    if (opts.length) clarify_options = opts;
  }

  let reasoning_trace: string[] | undefined;
  if (Array.isArray(raw.reasoning_trace)) {
    const rt = raw.reasoning_trace.filter((s): s is string => typeof s === 'string');
    if (rt.length) reasoning_trace = rt;
  }

  const structuredIn = raw.structured;
  let structured: LiteratureAgentDonePayload['structured'];
  if (structuredIn && typeof structuredIn === 'object' && !Array.isArray(structuredIn)) {
    const refs = normalizeReferences(
      (structuredIn as { references?: unknown }).references
    );
    if (refs.length) structured = { references: refs };
  }

  const sources = normalizeSources(raw.sources);

  return {
    role,
    content,
    answer: content,
    ...(session_id ? { session_id } : {}),
    ...(structured ? { structured } : {}),
    ...(sources.length ? { sources } : {}),
    ...(debug !== undefined ? { debug } : {}),
    ...(needs_clarification ? { needs_clarification: true } : {}),
    ...(clarify_question !== undefined ? { clarify_question } : {}),
    ...(clarify_options ? { clarify_options } : {}),
    ...(reasoning_trace ? { reasoning_trace } : {}),
  };
}
