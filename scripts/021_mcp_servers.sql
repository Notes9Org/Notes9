-- ============================================================================
-- MCP Servers Table for Catalyst AI
-- Script: 021_mcp_servers.sql
-- Description: Stores user's MCP server configurations including OAuth support
-- ============================================================================
-- This script is IDEMPOTENT - safe to run multiple times without side effects
-- ============================================================================

-- ======================
-- STEP 1: Create Table
-- ======================
CREATE TABLE IF NOT EXISTS mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  transport_type TEXT NOT NULL CHECK (transport_type IN ('http', 'sse')),
  url TEXT NOT NULL,
  headers JSONB DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT true,
  last_connected_at TIMESTAMPTZ,
  connection_status TEXT DEFAULT 'unknown' CHECK (connection_status IN ('connected', 'disconnected', 'error', 'unknown')),
  error_message TEXT,
  tools_count INTEGER DEFAULT 0,
  resources_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- OAuth fields for authenticated MCP servers (e.g., BioMCP)
  requires_auth BOOLEAN DEFAULT false,
  oauth_client_id TEXT,
  oauth_client_secret TEXT,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  oauth_scopes TEXT,
  
  -- Ensure unique server names per user
  CONSTRAINT unique_user_server_name UNIQUE (user_id, name)
);

-- ======================
-- STEP 2: Create Indexes
-- ======================
CREATE INDEX IF NOT EXISTS idx_mcp_servers_user_id ON mcp_servers(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(user_id, is_enabled);

-- ======================
-- STEP 3: Enable RLS
-- ======================
ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;

-- ======================
-- STEP 4: Drop existing policies (if any) to avoid conflicts
-- ======================
DROP POLICY IF EXISTS "Users can view own MCP servers" ON mcp_servers;
DROP POLICY IF EXISTS "Users can insert own MCP servers" ON mcp_servers;
DROP POLICY IF EXISTS "Users can update own MCP servers" ON mcp_servers;
DROP POLICY IF EXISTS "Users can delete own MCP servers" ON mcp_servers;

-- ======================
-- STEP 5: Create RLS Policies
-- ======================
-- Select policy: Users can only view their own servers
CREATE POLICY "Users can view own MCP servers"
  ON mcp_servers FOR SELECT
  USING (auth.uid() = user_id);

-- Insert policy: Users can only insert servers for themselves
CREATE POLICY "Users can insert own MCP servers"
  ON mcp_servers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update policy: Users can only update their own servers
CREATE POLICY "Users can update own MCP servers"
  ON mcp_servers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Delete policy: Users can only delete their own servers
CREATE POLICY "Users can delete own MCP servers"
  ON mcp_servers FOR DELETE
  USING (auth.uid() = user_id);

-- ======================
-- STEP 6: Create/Replace Trigger Function
-- ======================
CREATE OR REPLACE FUNCTION update_mcp_servers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ======================
-- STEP 7: Create Trigger (drop first if exists)
-- ======================
DROP TRIGGER IF EXISTS update_mcp_servers_updated_at ON mcp_servers;

CREATE TRIGGER update_mcp_servers_updated_at
  BEFORE UPDATE ON mcp_servers
  FOR EACH ROW
  EXECUTE FUNCTION update_mcp_servers_updated_at();

-- ======================
-- STEP 8: Add Documentation Comments
-- ======================
COMMENT ON TABLE mcp_servers IS 'Stores MCP (Model Context Protocol) server configurations for Catalyst AI chatbot';
COMMENT ON COLUMN mcp_servers.transport_type IS 'Transport protocol: http (recommended) or sse';
COMMENT ON COLUMN mcp_servers.headers IS 'JSON object of HTTP headers (e.g., {"Authorization": "Bearer xxx"})';
COMMENT ON COLUMN mcp_servers.connection_status IS 'Last known connection status: connected, disconnected, error, unknown';
COMMENT ON COLUMN mcp_servers.requires_auth IS 'Whether this MCP server requires OAuth authentication';
COMMENT ON COLUMN mcp_servers.oauth_access_token IS 'OAuth access token for authenticated servers';
COMMENT ON COLUMN mcp_servers.oauth_refresh_token IS 'OAuth refresh token for token renewal';
COMMENT ON COLUMN mcp_servers.oauth_token_expires_at IS 'When the OAuth access token expires';
COMMENT ON COLUMN mcp_servers.oauth_scopes IS 'OAuth scopes granted (e.g., mcp:tools)';

-- ============================================================================
-- VERIFICATION: Run this query after the script to confirm success
-- ============================================================================
-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'mcp_servers' 
-- ORDER BY ordinal_position;
-- ============================================================================
