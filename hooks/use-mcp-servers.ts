'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MCPServer, MCPServerCreate, MCPServerUpdate, MCPConnectionTestResult } from '@/lib/mcp/types';

interface OAuthConnectResult {
  success: boolean;
  requiresAuth: boolean;
  authUrl?: string;
  sessionId?: string;
  tools?: string[];
  error?: string;
}

export function useMCPServers() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const supabase = createClient();

  // Load all servers for current user
  const loadServers = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('mcp_servers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) {
        // Table might not exist yet - this is expected before migration
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('MCP servers table not found. Run the database migration first.');
          setServers([]);
          return;
        }
        throw error;
      }
      setServers(data || []);
    } catch (error) {
      // Silently handle if table doesn't exist
      console.warn('MCP servers not available:', error instanceof Error ? error.message : 'Unknown error');
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Add a new server
  const addServer = useCallback(async (server: MCPServerCreate): Promise<MCPServer | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('mcp_servers')
        .insert({
          user_id: user.id,
          name: server.name,
          description: server.description || null,
          transport_type: server.transport_type,
          url: server.url,
          headers: server.headers || {},
        })
        .select()
        .single();

      if (error) throw error;
      
      setServers((prev) => [...prev, data]);
      return data;
    } catch (error) {
      console.error('Error adding MCP server:', error);
      return null;
    }
  }, [supabase]);

  // Update a server
  const updateServer = useCallback(async (
    serverId: string,
    updates: MCPServerUpdate
  ): Promise<MCPServer | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('mcp_servers')
        .update(updates)
        .eq('id', serverId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      
      setServers((prev) => prev.map((s) => (s.id === serverId ? data : s)));
      return data;
    } catch (error) {
      console.error('Error updating MCP server:', error);
      return null;
    }
  }, [supabase]);

  // Delete a server
  const deleteServer = useCallback(async (serverId: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('mcp_servers')
        .delete()
        .eq('id', serverId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      setServers((prev) => prev.filter((s) => s.id !== serverId));
      return true;
    } catch (error) {
      console.error('Error deleting MCP server:', error);
      return false;
    }
  }, [supabase]);

  // Toggle server enabled/disabled
  const toggleServer = useCallback(async (serverId: string): Promise<boolean> => {
    const server = servers.find((s) => s.id === serverId);
    if (!server) return false;

    const result = await updateServer(serverId, { is_enabled: !server.is_enabled });
    return result !== null;
  }, [servers, updateServer]);

  // Test server connection
  const testConnection = useCallback(async (
    url: string,
    transportType: 'http' | 'sse',
    headers?: Record<string, string>
  ): Promise<MCPConnectionTestResult> => {
    try {
      const response = await fetch('/api/mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, transport_type: transportType, headers }),
      });

      if (!response.ok) {
        throw new Error('Test request failed');
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        tools: [],
        resources: [],
        latency_ms: 0,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }, []);

  // Test existing server by ID
  const testServerById = useCallback(async (serverId: string): Promise<MCPConnectionTestResult> => {
    const server = servers.find((s) => s.id === serverId);
    if (!server) {
      return {
        success: false,
        tools: [],
        resources: [],
        latency_ms: 0,
        error: 'Server not found',
      };
    }

    setTesting(serverId);
    try {
      const result = await testConnection(server.url, server.transport_type, server.headers);
      
      // Update server status in database
      await supabase
        .from('mcp_servers')
        .update({
          connection_status: result.success ? 'connected' : 'error',
          last_connected_at: result.success ? new Date().toISOString() : server.last_connected_at,
          tools_count: result.tools.length,
          resources_count: result.resources.length,
          error_message: result.error || null,
        })
        .eq('id', serverId);

      // Update local state
      setServers((prev) =>
        prev.map((s) =>
          s.id === serverId
            ? {
                ...s,
                connection_status: result.success ? 'connected' : 'error',
                last_connected_at: result.success ? new Date().toISOString() : s.last_connected_at,
                tools_count: result.tools.length,
                resources_count: result.resources.length,
                error_message: result.error || null,
              }
            : s
        )
      );

      return result;
    } finally {
      setTesting(null);
    }
  }, [servers, testConnection, supabase]);

  // Connect with OAuth (for authenticated MCP servers like BioMCP)
  const connectWithOAuth = useCallback(async (
    serverUrl: string,
    serverId?: string
  ): Promise<OAuthConnectResult> => {
    try {
      const callbackUrl = `${window.location.origin}/api/mcp/auth/callback`;
      
      const response = await fetch('/api/mcp/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl, callbackUrl, serverId }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.requiresAuth && data.authUrl) {
          return {
            success: false,
            requiresAuth: true,
            authUrl: data.authUrl,
            sessionId: data.sessionId,
          };
        }
        return {
          success: false,
          requiresAuth: false,
          error: data.error || 'Connection failed',
        };
      }

      return {
        success: true,
        requiresAuth: false,
        tools: data.tools,
        sessionId: data.sessionId,
      };
    } catch (error) {
      return {
        success: false,
        requiresAuth: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }, []);

  // Complete OAuth flow
  const finishOAuth = useCallback(async (
    authCode: string,
    sessionId: string,
    serverId?: string
  ): Promise<{ success: boolean; tools?: string[]; error?: string }> => {
    try {
      const response = await fetch('/api/mcp/auth/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authCode, sessionId, serverId }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error };
      }

      // Refresh servers list
      await loadServers();

      return { success: true, tools: data.tools };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OAuth completion failed',
      };
    }
  }, [loadServers]);

  // Load servers on mount
  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Computed values
  const connectedCount = servers.filter(
    (s) => s.is_enabled && s.connection_status === 'connected'
  ).length;

  const enabledCount = servers.filter((s) => s.is_enabled).length;

  return {
    servers,
    loading,
    testing,
    connectedCount,
    enabledCount,
    loadServers,
    addServer,
    updateServer,
    deleteServer,
    toggleServer,
    testConnection,
    testServerById,
    connectWithOAuth,
    finishOAuth,
  };
}
