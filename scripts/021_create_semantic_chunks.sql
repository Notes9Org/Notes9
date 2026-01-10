CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS semantic_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Source identification
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'lab_note',
      'literature_review',
      'protocol',
      'report',
      'experiment_summary'
    )
  ),
  source_id UUID NOT NULL,
  
  -- Scope for filtering
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  
  -- Chunk data
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  
  -- Full-text search
  fts tsvector GENERATED ALWAYS AS (
    to_tsvector('english', content)
  ) STORED,
  
  -- Metadata
  metadata JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE (source_type, source_id, chunk_index)
);

-- Create chunk_jobs queue table
CREATE TABLE IF NOT EXISTS chunk_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payload JSONB,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMPTZ
);

-- Prevent duplicate pending jobs for same source (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunk_jobs_unique_pending 
ON chunk_jobs (source_type, source_id, operation) 
WHERE status = 'pending';

-- Create indexes for semantic_chunks
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_source ON semantic_chunks(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_organization ON semantic_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_project ON semantic_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_experiment ON semantic_chunks(experiment_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_embedding ON semantic_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_fts ON semantic_chunks USING gin(fts);

-- Create indexes for chunk_jobs
CREATE INDEX IF NOT EXISTS idx_chunk_jobs_status ON chunk_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_chunk_jobs_source ON chunk_jobs(source_type, source_id);

-- Create trigger function to queue chunk jobs
CREATE OR REPLACE FUNCTION queue_semantic_chunk_job()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  proj_id UUID;
  exp_id UUID;
  content_text TEXT;
  title_text TEXT;
  source_type_value TEXT;
BEGIN
  -- Map table name to source_type (plural to singular)
  source_type_value := CASE TG_TABLE_NAME
    WHEN 'lab_notes' THEN 'lab_note'
    WHEN 'literature_reviews' THEN 'literature_review'
    WHEN 'protocols' THEN 'protocol'
    WHEN 'reports' THEN 'report'
    ELSE NULL
  END;
  
  -- Skip if unknown table
  IF source_type_value IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Skip UPDATE if content hasn't changed (handle different fields per table)
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'literature_reviews' THEN
      -- For literature_reviews, check abstract and personal_notes
      IF NEW.abstract = OLD.abstract AND NEW.personal_notes = OLD.personal_notes THEN
        RETURN NEW;
      END IF;
    ELSIF TG_TABLE_NAME IN ('lab_notes', 'reports', 'protocols') THEN
      -- For other tables, check content field
      IF NEW.content = OLD.content THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  
  -- Extract scope and content based on source type
  IF TG_TABLE_NAME = 'lab_notes' THEN
    -- Get organization from creator's profile
    SELECT organization_id INTO org_id
    FROM profiles
    WHERE id = COALESCE(NEW.created_by, OLD.created_by);
    
    proj_id := COALESCE(NEW.project_id, OLD.project_id);
    exp_id := COALESCE(NEW.experiment_id, OLD.experiment_id);
    content_text := COALESCE(NEW.content, OLD.content);
    title_text := COALESCE(NEW.title, OLD.title);
    
  ELSIF TG_TABLE_NAME = 'reports' THEN
    -- Get organization from generator's profile
    SELECT organization_id INTO org_id
    FROM profiles
    WHERE id = COALESCE(NEW.generated_by, OLD.generated_by);
    
    proj_id := COALESCE(NEW.project_id, OLD.project_id);
    exp_id := COALESCE(NEW.experiment_id, OLD.experiment_id);
    content_text := COALESCE(NEW.content, OLD.content);
    title_text := COALESCE(NEW.title, OLD.title);
    
  ELSIF TG_TABLE_NAME = 'protocols' THEN
    org_id := COALESCE(NEW.organization_id, OLD.organization_id);
    proj_id := NULL;
    exp_id := NULL;
    content_text := COALESCE(NEW.content, OLD.content);
    title_text := COALESCE(NEW.name, OLD.name);
    
  ELSIF TG_TABLE_NAME = 'literature_reviews' THEN
    org_id := COALESCE(NEW.organization_id, OLD.organization_id);
    proj_id := COALESCE(NEW.project_id, OLD.project_id);
    exp_id := COALESCE(NEW.experiment_id, OLD.experiment_id);
    -- Combine abstract and personal_notes for literature reviews
    content_text := COALESCE(
      CONCAT_WS(E'\n\n', NEW.abstract, NEW.personal_notes),
      CONCAT_WS(E'\n\n', OLD.abstract, OLD.personal_notes)
    );
    title_text := COALESCE(NEW.title, OLD.title);
  END IF;

  -- Handle DELETE operation
  IF TG_OP = 'DELETE' THEN
    -- Only insert if no pending job exists for this source
    INSERT INTO chunk_jobs (source_type, source_id, operation, payload)
    SELECT 
      source_type_value,
      OLD.id,
      'delete',
      jsonb_build_object(
        'organization_id', org_id,
        'project_id', proj_id,
        'experiment_id', exp_id
      )
    WHERE NOT EXISTS (
      SELECT 1 FROM chunk_jobs
      WHERE source_type = source_type_value
        AND source_id = OLD.id
        AND operation = 'delete'
        AND status = 'pending'
    );
    
    RETURN OLD;
  END IF;

  -- Handle INSERT/UPDATE operations
  -- Only process if content exists and is meaningful (at least 50 chars)
  IF content_text IS NOT NULL AND length(trim(content_text)) > 50 THEN
    -- Only insert if no pending job exists for this source
    INSERT INTO chunk_jobs (source_type, source_id, operation, payload)
    SELECT 
      source_type_value,
      NEW.id,
      LOWER(TG_OP),
      jsonb_build_object(
        'content', content_text,
        'title', COALESCE(title_text, ''),
        'organization_id', org_id,
        'project_id', proj_id,
        'experiment_id', exp_id
      )
    WHERE NOT EXISTS (
      SELECT 1 FROM chunk_jobs
      WHERE source_type = source_type_value
        AND source_id = NEW.id
        AND operation = LOWER(TG_OP)
        AND status = 'pending'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for each source table
DROP TRIGGER IF EXISTS sync_lab_notes_chunks ON lab_notes;
CREATE TRIGGER sync_lab_notes_chunks
  AFTER INSERT OR UPDATE OF content OR DELETE ON lab_notes
  FOR EACH ROW
  EXECUTE FUNCTION queue_semantic_chunk_job();

DROP TRIGGER IF EXISTS sync_reports_chunks ON reports;
CREATE TRIGGER sync_reports_chunks
  AFTER INSERT OR UPDATE OF content OR DELETE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION queue_semantic_chunk_job();

DROP TRIGGER IF EXISTS sync_protocols_chunks ON protocols;
CREATE TRIGGER sync_protocols_chunks
  AFTER INSERT OR UPDATE OF content OR DELETE ON protocols
  FOR EACH ROW
  EXECUTE FUNCTION queue_semantic_chunk_job();

DROP TRIGGER IF EXISTS sync_literature_reviews_chunks ON literature_reviews;
CREATE TRIGGER sync_literature_reviews_chunks
  AFTER INSERT OR UPDATE OF abstract, personal_notes OR DELETE ON literature_reviews
  FOR EACH ROW
  EXECUTE FUNCTION queue_semantic_chunk_job();

-- Verification
SELECT 'semantic_chunks table and chunk processing system created successfully' AS status;