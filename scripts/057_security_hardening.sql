-- 057 — Security hardening (RLS + storage policies)
-- ==================================================
-- Addresses findings from the 2026-05-27 security audit. Run statements ONE AT
-- A TIME in the Supabase SQL editor (storage.objects DDL can time out — see the
-- 055 README), or via `supabase db execute --file ...`.
--
-- Each section is independent and idempotent. Read the WARNING on §4 before
-- running it.

-- ══════════════════════════════════════════════════════════════
-- §1  literature_pdf_annotations — org isolation on UPDATE/DELETE  (audit C-3)
-- The INSERT policy checks org, but UPDATE/DELETE checked only created_by, and
-- organization_id was nullable. Backfill, enforce NOT NULL, add org checks.
-- ══════════════════════════════════════════════════════════════

-- 1a. Backfill any NULL org from the parent literature_review, then enforce.
UPDATE public.literature_pdf_annotations a
SET organization_id = lr.organization_id
FROM public.literature_reviews lr
WHERE a.literature_review_id = lr.id
  AND a.organization_id IS NULL;

-- Only enforce NOT NULL once no NULLs remain (the ALTER fails loudly otherwise,
-- which is the correct signal to investigate orphaned annotations).
ALTER TABLE public.literature_pdf_annotations
  ALTER COLUMN organization_id SET NOT NULL;

-- 1b. Replace UPDATE/DELETE policies to require BOTH ownership and org match.
DROP POLICY IF EXISTS "Users can update their literature PDF annotations" ON public.literature_pdf_annotations;
CREATE POLICY "Users can update their literature PDF annotations"
  ON public.literature_pdf_annotations FOR UPDATE
  USING (created_by = auth.uid()
         AND organization_id = (SELECT public.my_org_id()))
  WITH CHECK (created_by = auth.uid()
         AND organization_id = (SELECT public.my_org_id()));

DROP POLICY IF EXISTS "Users can delete their literature PDF annotations" ON public.literature_pdf_annotations;
CREATE POLICY "Users can delete their literature PDF annotations"
  ON public.literature_pdf_annotations FOR DELETE
  USING (created_by = auth.uid()
         AND organization_id = (SELECT public.my_org_id()));


-- ══════════════════════════════════════════════════════════════
-- §2  Literature PDF storage — tie the file path to the record owner  (audit C-2, H-6)
-- The 055 SELECT policy lets any org member read a literature PDF by path, but
-- never asserts that the path's owner segment (foldername[1]) matches the
-- record's creator. Add that tie so a member can't read an arbitrary uid prefix
-- by substituting a known literature id. Also restrict UPDATE/DELETE to the
-- file owner (org members should not delete each other's uploads).
-- Path convention: {ownerUid}/literature/{literatureReviewId}/{file}
-- ══════════════════════════════════════════════════════════════

-- 2a. SELECT: org members read, but only when path owner == record creator.
DROP POLICY IF EXISTS "Org members read literature PDFs in user bucket" ON storage.objects;
CREATE POLICY "Org members read literature PDFs in user bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(storage.objects.name))[2] = 'literature'
    AND EXISTS (
      SELECT 1 FROM public.literature_reviews lr
      WHERE lr.id::text = (storage.foldername(storage.objects.name))[3]
        AND lr.created_by::text = (storage.foldername(storage.objects.name))[1]
        AND lr.organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- 2b. UPDATE/DELETE: only the file owner (path prefix == auth.uid()).
DROP POLICY IF EXISTS "Org members update literature PDFs in user bucket" ON storage.objects;
CREATE POLICY "Owner updates literature PDFs in user bucket"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user'
    AND (storage.foldername(storage.objects.name))[1] = auth.uid()::text
    AND (storage.foldername(storage.objects.name))[2] = 'literature'
  );

DROP POLICY IF EXISTS "Org members delete literature PDFs in user bucket" ON storage.objects;
CREATE POLICY "Owner deletes literature PDFs in user bucket"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user'
    AND (storage.foldername(storage.objects.name))[1] = auth.uid()::text
    AND (storage.foldername(storage.objects.name))[2] = 'literature'
  );
-- (INSERT policy from 055/03 already enforces the uid prefix — leave it.)


-- ══════════════════════════════════════════════════════════════
-- §3  experiment-files bucket — close the "any authenticated user" hole  (audit C-1)
-- 014 granted SELECT/INSERT on bucket 'experiment-files' with only
-- `auth.uid() IS NOT NULL` — every user could read/write every org's files.
-- Replace with org-scoped policies. NOTE: current app code stores experiment
-- files in the 'user' bucket (045, [2]='experiment'), so 'experiment-files' may
-- be legacy. These policies are safe either way: they lock it down without
-- affecting the 'user' bucket. Path convention assumed: {orgId}/{experimentId}/...
-- If 'experiment-files' is unused, you may instead DROP its policies entirely.
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Users can read experiment files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload experiment files" ON storage.objects;
CREATE POLICY "Org members read experiment-files bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'experiment-files'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.id::text = (storage.foldername(storage.objects.name))[2]
        AND p.organization_id = (SELECT public.my_org_id())
    )
  );
CREATE POLICY "Org members write experiment-files bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'experiment-files'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.experiments e
      JOIN public.projects p ON p.id = e.project_id
      WHERE e.id::text = (storage.foldername(storage.objects.name))[2]
        AND p.organization_id = (SELECT public.my_org_id())
    )
  );


-- ══════════════════════════════════════════════════════════════
-- §4  Make storage buckets PRIVATE   (audit H-1, H-2)   ⚠️ READ BEFORE RUNNING
-- A `public: true` bucket serves objects via CDN URL with NO RLS — literature
-- PDFs / experiment files are readable by anyone with (or guessing) the URL.
-- Making them private is the correct fix, BUT it breaks any client code that
-- renders a stored object via getPublicUrl() (e.g. <img src=publicUrl>,
-- avatars). The in-app PDF viewer is already safe (it streams server-side via
-- the service role in /api/literature/[id]/viewer-pdf). Before enabling:
--   1. Find all getPublicUrl() callers and switch them to createSignedUrl().
--   2. Confirm avatars are in a different bucket OR also migrated to signed URLs.
-- Then UNCOMMENT and run:
--
-- UPDATE storage.buckets SET public = false WHERE id IN ('user', 'experiment-files');
--
-- Verify: SELECT id, public FROM storage.buckets;
