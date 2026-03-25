-- Writing workspace: research papers (rich HTML drafts, distinct from literature_reviews citations).
-- Run in Supabase SQL editor if this table is missing; the app expects `papers` + RLS below.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS papers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'published')),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_papers_created_by ON papers(created_by);
CREATE INDEX IF NOT EXISTS idx_papers_project_id ON papers(project_id);
CREATE INDEX IF NOT EXISTS idx_papers_updated_at ON papers(updated_at DESC);

ALTER TABLE papers ENABLE ROW LEVEL SECURITY;

-- Owner-only access (matches client: .eq("created_by", user.id))
CREATE POLICY "papers_select_own"
  ON papers FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "papers_insert_own"
  ON papers FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "papers_update_own"
  ON papers FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "papers_delete_own"
  ON papers FOR DELETE
  USING (created_by = auth.uid());

DROP TRIGGER IF EXISTS update_papers_updated_at ON papers;
CREATE TRIGGER update_papers_updated_at
  BEFORE UPDATE ON papers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE papers IS 'User-owned writing documents (Writing /papers); HTML body in content.';
