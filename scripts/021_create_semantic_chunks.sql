-- Migration: Create semantic_chunks and chunk_jobs tables
-- Purpose: Enable semantic search with vector embeddings for lab notes, reports, protocols, and literature reviews
-- Author: System
-- Date: 2025-01-20

-- Enable required extensions
-- Migration: Create semantic_chunks and chunk_jobs tables
-- Purpose: Enable semantic search with vector embeddings for lab notes, reports, protocols, and literature reviews
-- Author: System
-- Date: 2025-01-20

-- Enable required extensions
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
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
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
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
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

-- Add user_id column to existing tables if they don't exist (for migrations)
-- This MUST run before creating indexes on user_id
DO $$ 
BEGIN
  -- Add user_id to semantic_chunks if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'semantic_chunks' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE semantic_chunks 
    ADD COLUMN user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  
  -- Add user_id to chunk_jobs if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'chunk_jobs' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE chunk_jobs 
    ADD COLUMN user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for semantic_chunks
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_source ON semantic_chunks(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_organization ON semantic_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_project ON semantic_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_experiment ON semantic_chunks(experiment_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_user_id ON semantic_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_embedding ON semantic_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_semantic_chunks_fts ON semantic_chunks USING gin(fts);

-- Create indexes for chunk_jobs
CREATE INDEX IF NOT EXISTS idx_chunk_jobs_status ON chunk_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_chunk_jobs_source ON chunk_jobs(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_chunk_jobs_user_id ON chunk_jobs(user_id);

-- Create trigger function to queue chunk jobs
CREATE OR REPLACE FUNCTION queue_semantic_chunk_job()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  proj_id UUID;
  exp_id UUID;
  user_id_val UUID;
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
  
  -- Handle DELETE operation FIRST (before content extraction)
  IF TG_OP = 'DELETE' THEN
    -- Extract scope information for DELETE (we only need IDs, not content)
    IF TG_TABLE_NAME = 'lab_notes' THEN
      -- Get organization from creator's profile (use OLD since NEW is NULL for DELETE)
      SELECT organization_id INTO org_id
      FROM profiles
      WHERE id = OLD.created_by;
      
      proj_id := OLD.project_id;
      exp_id := OLD.experiment_id;
      user_id_val := OLD.created_by;
      
    ELSIF TG_TABLE_NAME = 'reports' THEN
      -- Get organization from generator's profile
      SELECT organization_id INTO org_id
      FROM profiles
      WHERE id = OLD.generated_by;
      
      proj_id := OLD.project_id;
      exp_id := OLD.experiment_id;
      user_id_val := OLD.generated_by;
      
    ELSIF TG_TABLE_NAME = 'protocols' THEN
      org_id := OLD.organization_id;
      proj_id := NULL;
      exp_id := NULL;
      user_id_val := OLD.created_by;
      
    ELSIF TG_TABLE_NAME = 'literature_reviews' THEN
      org_id := OLD.organization_id;
      proj_id := OLD.project_id;
      exp_id := OLD.experiment_id;
      user_id_val := OLD.created_by;
    END IF;
    
    -- Insert delete job (always create, even if org_id is NULL)
    -- Use INSERT ... ON CONFLICT to handle duplicate pending jobs gracefully
    INSERT INTO chunk_jobs (source_type, source_id, operation, user_id, payload)
    VALUES (
      source_type_value,
      OLD.id,
      'delete',
      user_id_val,
      jsonb_build_object(
        'organization_id', org_id,
        'project_id', proj_id,
        'experiment_id', exp_id,
        'user_id', user_id_val
      )
    )
    ON CONFLICT (source_type, source_id, operation) 
    WHERE status = 'pending'
    DO NOTHING;
    
    RETURN OLD;
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
  
  -- Extract scope and content based on source type (for INSERT/UPDATE only)
  IF TG_TABLE_NAME = 'lab_notes' THEN
    -- Get organization from creator's profile
    SELECT organization_id INTO org_id
    FROM profiles
    WHERE id = NEW.created_by;
    
    proj_id := NEW.project_id;
    exp_id := NEW.experiment_id;
    user_id_val := NEW.created_by;
    content_text := NEW.content;
    title_text := NEW.title;
    
  ELSIF TG_TABLE_NAME = 'reports' THEN
    -- Get organization from generator's profile
    SELECT organization_id INTO org_id
    FROM profiles
    WHERE id = NEW.generated_by;
    
    proj_id := NEW.project_id;
    exp_id := NEW.experiment_id;
    user_id_val := NEW.generated_by;
    content_text := NEW.content;
    title_text := NEW.title;
    
  ELSIF TG_TABLE_NAME = 'protocols' THEN
    org_id := NEW.organization_id;
    proj_id := NULL;
    exp_id := NULL;
    user_id_val := NEW.created_by;
    content_text := NEW.content;
    title_text := NEW.name;
    
  ELSIF TG_TABLE_NAME = 'literature_reviews' THEN
    org_id := NEW.organization_id;
    proj_id := NEW.project_id;
    exp_id := NEW.experiment_id;
    user_id_val := NEW.created_by;
    -- Combine abstract and personal_notes for literature reviews
    content_text := CONCAT_WS(E'\n\n', NEW.abstract, NEW.personal_notes);
    title_text := NEW.title;
  END IF;

  -- Handle INSERT/UPDATE operations
  -- Only process if content exists and is meaningful (at least 50 chars)
  IF content_text IS NOT NULL AND length(trim(content_text)) > 50 THEN
    -- Insert job using ON CONFLICT to handle duplicates gracefully
    -- Update payload if a pending job already exists (for UPDATE operations)
    INSERT INTO chunk_jobs (source_type, source_id, operation, user_id, payload)
    VALUES (
      source_type_value,
      NEW.id,
      CASE TG_OP
        WHEN 'INSERT' THEN 'create'
        WHEN 'UPDATE' THEN 'update'
        ELSE 'create'
      END,
      user_id_val,
      jsonb_build_object(
        'content', content_text,
        'title', COALESCE(title_text, ''),
        'organization_id', org_id,
        'project_id', proj_id,
        'experiment_id', exp_id,
        'user_id', user_id_val
      )
    )
    ON CONFLICT (source_type, source_id, operation) 
    WHERE status = 'pending'
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      payload = EXCLUDED.payload,
      created_at = NOW();
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