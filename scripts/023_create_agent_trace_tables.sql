-- Agent Trace Tables
-- Purpose: Persistent logging for agent execution traces
-- Author: System
-- Date: 2025-01-20

-- Table: agent_runs
-- Tracks each agent execution with metadata
CREATE TABLE IF NOT EXISTS agent_runs (
  run_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  organization_id TEXT NOT NULL,
  project_id TEXT,
  created_by TEXT,
  session_id TEXT,
  query TEXT NOT NULL,
  status TEXT DEFAULT 'running',  -- running, completed, failed
  completed_at TIMESTAMPTZ,
  total_latency_ms INTEGER,
  final_confidence FLOAT,
  tool_used TEXT
);

-- Table: agent_trace_events
-- Stores per-node execution events
CREATE TABLE IF NOT EXISTS agent_trace_events (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  node_name TEXT NOT NULL,  -- normalize, router, sql, rag, summarizer, judge, retry, final
  event_type TEXT NOT NULL,  -- input, output, error, metric
  payload JSONB NOT NULL,
  latency_ms INTEGER
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_agent_runs_org ON agent_runs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_by ON agent_runs(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_trace_events_run ON agent_trace_events(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_trace_events_node ON agent_trace_events(run_id, node_name);

-- Enable Row Level Security
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_trace_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for idempotency)
DROP POLICY IF EXISTS "Users can view agent runs in their organization" ON agent_runs;
DROP POLICY IF EXISTS "Users can view their own agent runs" ON agent_runs;
DROP POLICY IF EXISTS "Service role full access agent_runs" ON agent_runs;
DROP POLICY IF EXISTS "Users can view agent trace events in their organization" ON agent_trace_events;
DROP POLICY IF EXISTS "Service role full access agent_trace_events" ON agent_trace_events;

-- RLS Policies for agent_runs

-- Policy: Users can view runs from their organization
CREATE POLICY "Users can view agent runs in their organization"
  ON agent_runs
  FOR SELECT
  USING (
    organization_id = (
      SELECT CAST(organization_id AS TEXT) FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can view their own runs
CREATE POLICY "Users can view their own agent runs"
  ON agent_runs
  FOR SELECT
  USING (created_by = CAST(auth.uid() AS TEXT));

-- Policy: Service role has full access
CREATE POLICY "Service role full access agent_runs"
  ON agent_runs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for agent_trace_events

-- Policy: Users can view trace events for runs in their organization
CREATE POLICY "Users can view agent trace events in their organization"
  ON agent_trace_events
  FOR SELECT
  USING (
    run_id IN (
      SELECT run_id FROM agent_runs
      WHERE organization_id = (
        SELECT CAST(organization_id AS TEXT) FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Policy: Service role has full access
CREATE POLICY "Service role full access agent_trace_events"
  ON agent_trace_events
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
