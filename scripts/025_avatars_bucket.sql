-- Avatars storage bucket for profile photos
-- 1. Create the bucket in Supabase Dashboard: Storage > New bucket > Name: avatars, Public: true
-- 2. Then run the policies below in SQL Editor

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- Allow authenticated users to upload/update their own avatar (path: user_id/avatar.*)
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' AND
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read (bucket is public)
CREATE POLICY "Public read avatars"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Allow users to update their own avatar
CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
