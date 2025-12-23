-- 1. Ensure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('lab_notes_public', 'lab_notes_public', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- 2. Clean up any conflicting policies (idempotent)
DROP POLICY IF EXISTS "Public View lab_notes_public" ON storage.objects;
DROP POLICY IF EXISTS "Upload lab_notes_public" ON storage.objects;
DROP POLICY IF EXISTS "Update lab_notes_public" ON storage.objects;
DROP POLICY IF EXISTS "Delete lab_notes_public" ON storage.objects;

-- 3. Re-create the policies
-- Allow public read access (SELECT)
CREATE POLICY "Public View lab_notes_public"
ON storage.objects FOR SELECT
USING ( bucket_id = 'lab_notes_public' );

-- Allow authenticated users to upload (INSERT)
CREATE POLICY "Upload lab_notes_public"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lab_notes_public' AND
  auth.role() = 'authenticated'
);

-- Allow users to update their own files (UPDATE)
CREATE POLICY "Update lab_notes_public"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'lab_notes_public' AND
  auth.uid() = owner
);

-- Allow users to delete their own files (DELETE)
CREATE POLICY "Delete lab_notes_public"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lab_notes_public' AND
  auth.uid() = owner
);
