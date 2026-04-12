// Database schema types for chat features

export interface Vote {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  /** Protocol AI when set; null for Catalyst. */
  protocol_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

/** Stored in `content_diffs.diff_segments` — word-level fragments plus `_` skips for unchanged runs (no full-body snapshots). */
export type ContentDiffSegment =
  | { k: '+'; v: string }
  | { k: '-'; v: string }
  | { k: '_'; n: number };

/**
 * Stored in `content_diffs.structure_hints` JSON (compact: title once, sections without repeated title).
 * Legacy rows may still use `{ section_trails: string[] }` only — normalize when reading.
 */
export interface ContentDiffStructureHints {
  document_title: string | null;
  sections: string[];
}

export interface ContentDiff {
  id: string;
  record_type: 'protocol' | 'lab_note';
  record_id: string;
  user_id: string;
  change_summary: string | null;
  /** Compact change log (preferred). */
  diff_segments: ContentDiffSegment[] | null;
  /** Heading trails (document title + sections) for audit context. */
  structure_hints?: ContentDiffStructureHints | null;
  /**
   * Legacy columns — removed in migration `042_content_diffs_diff_segments.sql`; may still be
   * present when reading old API responses.
   */
  previous_content?: string | null;
  new_content?: string | null;
  words_added: number;
  words_removed: number;
  created_at: string;
  /** Joined from profiles — available when fetched with user select */
  user?: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

