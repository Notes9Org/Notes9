-- =============================================================================
-- Collaborative Editing Migration
-- Adds Yjs document storage for real-time collaborative editing
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create paper_yjs_documents table for storing Yjs binary state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paper_yjs_documents (
  paper_id UUID PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  yjs_state BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Add index on updated_at for efficient queries by the collaboration server
-- ---------------------------------------------------------------------------
CREATE INDEX idx_paper_yjs_documents_updated_at ON paper_yjs_documents(updated_at);
