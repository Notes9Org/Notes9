-- Literature: catalog placement (staging vs repository), PDF import status, optional extracted text
-- Storage: public bucket `user` for paths `{user_id}/literature/{literature_id}/...`

INSERT INTO storage.buckets (id, name, public)
VALUES ('user', 'user', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE literature_reviews
  ADD COLUMN IF NOT EXISTS catalog_placement TEXT NOT NULL DEFAULT 'repository'
    CONSTRAINT literature_reviews_catalog_placement_check
    CHECK (catalog_placement = ANY (ARRAY['staging'::text, 'repository'::text]));

ALTER TABLE literature_reviews
  ADD COLUMN IF NOT EXISTS pdf_import_status TEXT
    CONSTRAINT literature_reviews_pdf_import_status_check
    CHECK (
      pdf_import_status IS NULL
      OR pdf_import_status = ANY (ARRAY['none'::text, 'pending'::text, 'success'::text, 'failed'::text])
    );

ALTER TABLE literature_reviews
  ADD COLUMN IF NOT EXISTS pdf_extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS pdf_text_extracted_at TIMESTAMPTZ;

UPDATE literature_reviews
SET pdf_import_status = CASE
  WHEN pdf_storage_path IS NOT NULL THEN 'success'
  ELSE 'none'
END
WHERE pdf_import_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_literature_reviews_catalog_placement_org
  ON literature_reviews(organization_id, catalog_placement);

CREATE INDEX IF NOT EXISTS idx_literature_reviews_staging_org_created
  ON literature_reviews(organization_id, created_at DESC)
  WHERE catalog_placement = 'staging';

-- --- Storage RLS for bucket `user`: first path segment must equal auth.uid() ---
DROP POLICY IF EXISTS "Users can upload to own user bucket prefix" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own user bucket prefix" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own user bucket prefix" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own user bucket prefix" ON storage.objects;

CREATE POLICY "Users can upload to own user bucket prefix"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own user bucket prefix"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own user bucket prefix"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own user bucket prefix"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

SELECT '036_literature_catalog_placement applied' AS status;
