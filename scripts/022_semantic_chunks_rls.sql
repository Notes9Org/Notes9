-- RLS Policies for semantic_chunks and chunk_jobs tables
-- Purpose: Enable Row Level Security with organization and user-based access control
-- Author: System
-- Date: 2025-01-20

-- Enable Row Level Security
ALTER TABLE semantic_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunk_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for idempotency)
DROP POLICY IF EXISTS "Users can view semantic chunks in their organization" ON semantic_chunks;
DROP POLICY IF EXISTS "Users can view their own semantic chunks" ON semantic_chunks;
DROP POLICY IF EXISTS "Service role full access semantic_chunks" ON semantic_chunks;
DROP POLICY IF EXISTS "Users can view chunk jobs in their organization" ON chunk_jobs;
DROP POLICY IF EXISTS "Users can view their own chunk jobs" ON chunk_jobs;
DROP POLICY IF EXISTS "Service role full access chunk_jobs" ON chunk_jobs;

-- RLS Policies for semantic_chunks

-- Policy: Users can view chunks from their organization
CREATE POLICY "Users can view semantic chunks in their organization"
  ON semantic_chunks
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can view their own chunks (for created_by-based access)
CREATE POLICY "Users can view their own semantic chunks"
  ON semantic_chunks
  FOR SELECT
  USING (created_by = auth.uid());

-- Policy: Service role can do everything (for worker process)
CREATE POLICY "Service role full access semantic_chunks"
  ON semantic_chunks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for chunk_jobs

-- Policy: Users can view chunk jobs from their organization
CREATE POLICY "Users can view chunk jobs in their organization"
  ON chunk_jobs
  FOR SELECT
  USING (
    (payload->>'organization_id')::uuid IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can view their own chunk jobs (for created_by-based access)
CREATE POLICY "Users can view their own chunk jobs"
  ON chunk_jobs
  FOR SELECT
  USING (created_by = auth.uid());

-- Policy: Service role can manage chunk jobs (for worker process)
CREATE POLICY "Service role full access chunk_jobs"
  ON chunk_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Verification
SELECT 'RLS policies for semantic_chunks and chunk_jobs created successfully' AS status;