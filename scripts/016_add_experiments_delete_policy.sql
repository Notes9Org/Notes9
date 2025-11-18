-- Add missing DELETE policy for experiments table
-- Users should be able to delete experiments they created

CREATE POLICY "Users can delete experiments they created"
  ON experiments FOR DELETE
  USING (created_by = auth.uid());

-- Verify policy was created
SELECT 
    tablename,
    policyname,
    cmd as operation
FROM pg_policies 
WHERE tablename = 'experiments' AND cmd = 'DELETE';

