-- Downgrade for 027_literature_pdf_support.sql
-- Warning: this removes literature PDF annotation data and PDF metadata columns.
-- It does not delete uploaded storage objects from Supabase Storage.

DROP TRIGGER IF EXISTS update_literature_pdf_annotations_updated_at ON literature_pdf_annotations;

DROP POLICY IF EXISTS "Users can view literature PDF annotations in their organization" ON literature_pdf_annotations;
DROP POLICY IF EXISTS "Users can create literature PDF annotations in their organization" ON literature_pdf_annotations;
DROP POLICY IF EXISTS "Users can update their literature PDF annotations" ON literature_pdf_annotations;
DROP POLICY IF EXISTS "Users can delete their literature PDF annotations" ON literature_pdf_annotations;

DROP TABLE IF EXISTS literature_pdf_annotations;

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
  DROP COLUMN IF EXISTS pdf_file_url,
  DROP COLUMN IF EXISTS pdf_file_name,
  DROP COLUMN IF EXISTS pdf_file_size,
  DROP COLUMN IF EXISTS pdf_file_type,
  DROP COLUMN IF EXISTS pdf_storage_path,
  DROP COLUMN IF EXISTS pdf_uploaded_at,
  DROP COLUMN IF EXISTS pdf_checksum,
  DROP COLUMN IF EXISTS pdf_match_source,
  DROP COLUMN IF EXISTS pdf_metadata;
