-- Enable Row Level Security
ALTER TABLE semantic_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunk_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for semantic_chunks
-- Users can view chunks from their organization
CREATE POLICY "Users can view semantic chunks in their organization"
  ON semantic_chunks FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Service role can do everything (for worker process)
CREATE POLICY "Service role full access semantic_chunks"
  ON semantic_chunks FOR ALL
  USING (true)
  WITH CHECK (true);

-- RLS Policies for chunk_jobs
-- Users can view chunk jobs from their organization
CREATE POLICY "Users can view chunk jobs in their organization"
  ON chunk_jobs FOR SELECT
  USING (
    (payload->>'organization_id')::uuid IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Service role can manage chunk jobs (for worker process)
CREATE POLICY "Service role full access chunk_jobs"
  ON chunk_jobs FOR ALL
  USING (true)
  WITH CHECK (true);