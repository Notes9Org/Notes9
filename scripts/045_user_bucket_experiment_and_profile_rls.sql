-- Experiment data files + profile avatars in bucket `user`
-- Apply after code deploys paths: `{org_id}/experiment/{experiment_id}/{experiment_data_id}/{file_name}`
-- and `{user_id}/profile/avatar.{ext}`.
--
-- Requires bucket `user` (scripts/036_literature_catalog_placement.sql) and existing personal/org protocol policies.

-- ---------------------------------------------------------------------------
-- Org members: experiment file prefixes under `user`
-- Path: {organization_id}/experiment/{experiment_id}/{experiment_data_id}/filename
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Org members read experiment files in user bucket" ON storage.objects;
DROP POLICY IF EXISTS "Org members insert experiment files in user bucket" ON storage.objects;
DROP POLICY IF EXISTS "Org members update experiment files in user bucket" ON storage.objects;
DROP POLICY IF EXISTS "Org members delete experiment files in user bucket" ON storage.objects;

CREATE POLICY "Org members read experiment files in user bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(storage.objects.name))[2] = 'experiment'
    AND (storage.foldername(storage.objects.name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.id::text = (storage.foldername(storage.objects.name))[3]
        AND p.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Org members insert experiment files in user bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(storage.objects.name))[2] = 'experiment'
    AND (storage.foldername(storage.objects.name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.id::text = (storage.foldername(storage.objects.name))[3]
        AND p.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Org members update experiment files in user bucket"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(storage.objects.name))[2] = 'experiment'
    AND (storage.foldername(storage.objects.name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.id::text = (storage.foldername(storage.objects.name))[3]
        AND p.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Org members delete experiment files in user bucket"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(storage.objects.name))[2] = 'experiment'
    AND (storage.foldername(storage.objects.name))[1] = (SELECT organization_id::text FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.id::text = (storage.foldername(storage.objects.name))[3]
        AND p.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Profile avatars: world-readable URLs (bucket `user` is public) for paths
-- `{uuid}/profile/avatar.{ext}` so other signed-in users can load avatars from profile.avatar_url.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public read profile avatars in user bucket" ON storage.objects;

CREATE POLICY "Public read profile avatars in user bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user'
    AND storage.objects.name ~ '^[0-9a-fA-F-]{36}/profile/avatar\.[^/]+$'
  );

SELECT '045_user_bucket_experiment_and_profile_rls applied' AS status;
