// MCP Configuration helpers
// Server-side functions to fetch MCP server configs from database

import { createClient } from '@/lib/supabase/server';
import type { MCPServer, MCPServerCreate, MCPServerUpdate } from './types';

/**
 * Get all MCP servers for a user (server-side)
 */
export async function getUserMCPServers(userId: string): Promise<MCPServer[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('mcp_servers')
    .select('*')
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching MCP servers:', error);
    return [];
  }

  return data as MCPServer[];
}

/**
 * Get all MCP servers for a user (including disabled)
 */
export async function getAllUserMCPServers(userId: string): Promise<MCPServer[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('mcp_servers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching MCP servers:', error);
    return [];
  }

  return data as MCPServer[];
}

/**
 * Create a new MCP server configuration
 */
export async function createMCPServer(
  userId: string,
  server: MCPServerCreate
): Promise<MCPServer | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('mcp_servers')
    .insert({
      user_id: userId,
      name: server.name,
      description: server.description || null,
      transport_type: server.transport_type,
      url: server.url,
      headers: server.headers || {},
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating MCP server:', error);
    return null;
  }

  return data as MCPServer;
}

/**
 * Update an MCP server configuration
 */
export async function updateMCPServer(
  serverId: string,
  userId: string,
  updates: MCPServerUpdate
): Promise<MCPServer | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('mcp_servers')
    .update(updates)
    .eq('id', serverId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating MCP server:', error);
    return null;
  }

  return data as MCPServer;
}

/**
 * Delete an MCP server configuration
 */
export async function deleteMCPServer(
  serverId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('mcp_servers')
    .delete()
    .eq('id', serverId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting MCP server:', error);
    return false;
  }

  return true;
}

/**
 * Update MCP server connection status
 */
export async function updateMCPServerStatus(
  serverId: string,
  userId: string,
  status: 'connected' | 'disconnected' | 'error',
  toolsCount?: number,
  resourcesCount?: number,
  errorMessage?: string
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('mcp_servers')
    .update({
      connection_status: status,
      last_connected_at: status === 'connected' ? new Date().toISOString() : undefined,
      tools_count: toolsCount ?? 0,
      resources_count: resourcesCount ?? 0,
      error_message: errorMessage || null,
    })
    .eq('id', serverId)
    .eq('user_id', userId);
}
