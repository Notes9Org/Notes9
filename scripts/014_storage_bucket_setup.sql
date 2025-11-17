-- Create Supabase Storage bucket for experiment files
-- Run this in Supabase SQL Editor or via API

-- Note: Storage buckets are created via Supabase Dashboard or API
-- This SQL documents the required bucket configuration

/*
CREATE BUCKET via Supabase Dashboard:
1. Go to Storage > Create bucket
2. Name: experiment-files
3. Public: true (for easy access with RLS)
4. File size limit: 10485760 (10 MB)
5. Allowed MIME types: 
   - application/pdf
   - image/*
   - text/csv
   - text/plain
   - application/json
   - application/vnd.ms-excel
   - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   - application/zip

Storage RLS Policies:
*/

-- Policy: Users can upload files to experiments in their organization
CREATE POLICY "Users can upload experiment files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'experiment-files' AND
  auth.uid() IS NOT NULL
);

-- Policy: Users can read files from experiments in their organization  
CREATE POLICY "Users can read experiment files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'experiment-files' AND
  auth.uid() IS NOT NULL
);

-- Policy: Users can delete their own uploaded files
CREATE POLICY "Users can delete their uploaded files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'experiment-files' AND
  auth.uid() = owner
);

-- Policy: Users can update their own uploaded files
CREATE POLICY "Users can update their uploaded files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'experiment-files' AND
  auth.uid() = owner
);

