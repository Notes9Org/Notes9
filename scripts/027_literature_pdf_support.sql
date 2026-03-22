-- Migration: add literature PDF storage and annotation support
-- Rollback: run scripts/027_literature_pdf_support_down.sql
-- Note: rollback removes annotation data and metadata references but does not remove
-- already-uploaded storage objects in Supabase Storage.

ALTER TABLE literature_reviews
  ADD COLUMN IF NOT EXISTS pdf_file_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_file_name VARCHAR(512),
  ADD COLUMN IF NOT EXISTS pdf_file_size BIGINT,
  ADD COLUMN IF NOT EXISTS pdf_file_type VARCHAR(128),
  ADD COLUMN IF NOT EXISTS pdf_storage_path VARCHAR(1024),
  ADD COLUMN IF NOT EXISTS pdf_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdf_checksum VARCHAR(128),
  ADD COLUMN IF NOT EXISTS pdf_match_source VARCHAR(64),
  ADD COLUMN IF NOT EXISTS pdf_metadata JSONB;

ALTER TABLE literature_reviews
  DROP CONSTRAINT IF EXISTS literature_reviews_title_length_check,
  DROP CONSTRAINT IF EXISTS literature_reviews_authors_length_check,
  DROP CONSTRAINT IF EXISTS literature_reviews_journal_length_check,
  DROP CONSTRAINT IF EXISTS literature_reviews_doi_length_check,
  DROP CONSTRAINT IF EXISTS literature_reviews_pmid_length_check,
  DROP CONSTRAINT IF EXISTS literature_reviews_url_length_check,
  DROP CONSTRAINT IF EXISTS literature_reviews_abstract_length_check,
  DROP CONSTRAINT IF EXISTS literature_reviews_personal_notes_length_check;

ALTER TABLE literature_reviews
  ADD CONSTRAINT literature_reviews_title_length_check CHECK (char_length(title) <= 1024),
  ADD CONSTRAINT literature_reviews_authors_length_check CHECK (authors IS NULL OR char_length(authors) <= 4000),
  ADD CONSTRAINT literature_reviews_journal_length_check CHECK (journal IS NULL OR char_length(journal) <= 512),
  ADD CONSTRAINT literature_reviews_doi_length_check CHECK (doi IS NULL OR char_length(doi) <= 256),
  ADD CONSTRAINT literature_reviews_pmid_length_check CHECK (pmid IS NULL OR char_length(pmid) <= 64),
  ADD CONSTRAINT literature_reviews_url_length_check CHECK (url IS NULL OR char_length(url) <= 2048),
  ADD CONSTRAINT literature_reviews_abstract_length_check CHECK (abstract IS NULL OR char_length(abstract) <= 20000),
  ADD CONSTRAINT literature_reviews_personal_notes_length_check CHECK (personal_notes IS NULL OR char_length(personal_notes) <= 50000);

CREATE TABLE IF NOT EXISTS literature_pdf_annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  literature_review_id UUID NOT NULL REFERENCES literature_reviews(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('highlight', 'note', 'comment')),
  page_number INTEGER NOT NULL,
  quote_text TEXT CHECK (quote_text IS NULL OR char_length(quote_text) <= 5000),
  comment_text TEXT CHECK (comment_text IS NULL OR char_length(comment_text) <= 10000),
  color VARCHAR(32),
  rects JSONB,
  anchor JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_literature_pdf_annotations_literature_review_id
  ON literature_pdf_annotations(literature_review_id);
CREATE INDEX IF NOT EXISTS idx_literature_pdf_annotations_organization_id
  ON literature_pdf_annotations(organization_id);
CREATE INDEX IF NOT EXISTS idx_literature_pdf_annotations_created_by
  ON literature_pdf_annotations(created_by);

ALTER TABLE literature_pdf_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view literature PDF annotations in their organization" ON literature_pdf_annotations;
DROP POLICY IF EXISTS "Users can create literature PDF annotations in their organization" ON literature_pdf_annotations;
DROP POLICY IF EXISTS "Users can update their literature PDF annotations" ON literature_pdf_annotations;
DROP POLICY IF EXISTS "Users can delete their literature PDF annotations" ON literature_pdf_annotations;

CREATE POLICY "Users can view literature PDF annotations in their organization"
  ON literature_pdf_annotations FOR SELECT
  USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can create literature PDF annotations in their organization"
  ON literature_pdf_annotations FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id = get_user_organization_id(auth.uid())
  );

CREATE POLICY "Users can update their literature PDF annotations"
  ON literature_pdf_annotations FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their literature PDF annotations"
  ON literature_pdf_annotations FOR DELETE
  USING (created_by = auth.uid());

DROP TRIGGER IF EXISTS update_literature_pdf_annotations_updated_at ON literature_pdf_annotations;

CREATE TRIGGER update_literature_pdf_annotations_updated_at
  BEFORE UPDATE ON literature_pdf_annotations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
