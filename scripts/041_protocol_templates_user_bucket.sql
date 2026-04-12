-- Protocol document templates: store files in the shared `user` bucket (same as literature PDFs),
-- at keys `{organization_id}/protocol/{template_id}/...` so any org member can read/write per RLS.
-- Requires bucket `user` (see scripts/036_literature_catalog_placement.sql).
-- Legacy bucket `protocol-templates` + keys `{org_id}/{template_id}/...` (no `protocol` segment) remain supported in app code for deletes/downloads until migrated.

DROP POLICY IF EXISTS "Org members read protocol template files" ON storage.objects;
DROP POLICY IF EXISTS "Org members insert protocol template files" ON storage.objects;
DROP POLICY IF EXISTS "Org members update protocol template files" ON storage.objects;
DROP POLICY IF EXISTS "Org members delete protocol template files" ON storage.objects;

CREATE POLICY "Org members read protocol template files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = 'protocol'
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org members insert protocol template files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = 'protocol'
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org members update protocol template files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = 'protocol'
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Org members delete protocol template files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = 'protocol'
    AND (storage.foldername(name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
  );

SELECT '041_protocol_templates_user_bucket applied' AS status;
