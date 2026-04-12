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

export interface ContentDiff {
  id: string;
  record_type: 'protocol' | 'lab_note';
  record_id: string;
  user_id: string;
  change_summary: string | null;
  previous_content: string;
  new_content: string;
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

