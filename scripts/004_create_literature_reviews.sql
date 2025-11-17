-- Migration: Create literature_reviews table for Notes9
-- Purpose: Store research paper references and citations
-- Author: System
-- Date: 2025-01-17

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create literature_reviews table
CREATE TABLE IF NOT EXISTS literature_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Core Citation Fields
  title TEXT NOT NULL,
  authors TEXT,  -- Comma-separated for MVP
  journal TEXT,
  publication_year INTEGER,
  volume TEXT,
  issue TEXT,
  pages TEXT,
  doi TEXT,
  pmid TEXT,  -- PubMed ID
  url TEXT,
  
  -- Research Context
  abstract TEXT,
  keywords TEXT[],  -- Array of keywords
  
  -- User Notes
  personal_notes TEXT,
  relevance_rating INTEGER CHECK (relevance_rating BETWEEN 1 AND 5),
  
  -- Relationships
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  
  -- Status
  status TEXT DEFAULT 'saved' CHECK (status IN ('saved', 'reading', 'completed', 'archived')),
  
  -- Metadata
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_literature_reviews_organization ON literature_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_literature_reviews_project ON literature_reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_literature_reviews_experiment ON literature_reviews(experiment_id);
CREATE INDEX IF NOT EXISTS idx_literature_reviews_status ON literature_reviews(status);
CREATE INDEX IF NOT EXISTS idx_literature_reviews_created_by ON literature_reviews(created_by);

-- Enable Row Level Security
ALTER TABLE literature_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view literature in their organization
CREATE POLICY "Users can view literature in their organization"
  ON literature_reviews FOR SELECT
  USING (organization_id = get_user_organization_id(auth.uid()));

-- RLS Policy: Users can create literature in their organization
CREATE POLICY "Users can create literature in their organization"
  ON literature_reviews FOR INSERT
  WITH CHECK (
    created_by = auth.uid() 
    AND organization_id = get_user_organization_id(auth.uid())
  );

-- RLS Policy: Users can update literature they created
CREATE POLICY "Users can update literature they created"
  ON literature_reviews FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- RLS Policy: Users can delete literature they created
CREATE POLICY "Users can delete literature they created"
  ON literature_reviews FOR DELETE
  USING (created_by = auth.uid());

-- Trigger for updated_at timestamp
CREATE TRIGGER update_literature_reviews_updated_at
  BEFORE UPDATE ON literature_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Verification
SELECT 'literature_reviews table created successfully' AS status;

