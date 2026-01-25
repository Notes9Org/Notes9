// MCP Connector Module for Catalyst AI
// Handles creating MCP clients and aggregating tools from multiple servers

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { MCPServer, MCPConnectionTestResult } from './types';

/**
 * Create MCP tools from user's enabled servers
 * Returns aggregated tools from all connected servers and the clients for cleanup
 */
export async function createMCPToolsFromServers(
  servers: MCPServer[]
): Promise<{ tools: Record<string, unknown>; clients: MCPClient[] }> {
  const clients: MCPClient[] = [];
  let allTools: Record<string, unknown> = {};

  // Filter to only enabled servers
  const enabledServers = servers.filter((s) => s.is_enabled);

  for (const server of enabledServers) {
    try {
      const client = await createMCPClient({
        transport: {
          type: server.transport_type,
          url: server.url,
          headers: server.headers || {},
        },
      });

      clients.push(client);

      // Get tools from this MCP server
      const serverTools = await client.tools();

      // Namespace tools by server name to avoid conflicts
      // e.g., "notion_search_pages" instead of just "search_pages"
      const namespacedTools = Object.fromEntries(
        Object.entries(serverTools).map(([name, tool]) => [
          `${server.name.toLowerCase().replace(/\s+/g, '_')}_${name}`,
          tool,
        ])
      );

      allTools = { ...allTools, ...namespacedTools };
    } catch (error) {
      console.error(`Failed to connect to MCP server ${server.name}:`, error);
      // Continue with other servers even if one fails
    }
  }

  return { tools: allTools, clients };
}

/**
 * Test connection to an MCP server
 * Returns connection status, available tools, and latency
 */
export async function testMCPConnection(
  url: string,
  transportType: 'http' | 'sse',
  headers?: Record<string, string>
): Promise<MCPConnectionTestResult> {
  const startTime = Date.now();
  let client: MCPClient | null = null;

  try {
    client = await createMCPClient({
      transport: {
        type: transportType,
        url,
        headers: headers || {},
      },
    });

    // Get tools and resources to verify connection
    const tools = await client.tools();
    const toolNames = Object.keys(tools);

    // Try to list resources (optional, may not be supported)
    let resourceNames: string[] = [];
    try {
      const resources = await client.listResources();
      resourceNames = resources.resources?.map((r) => r.name) || [];
    } catch {
      // Resources may not be supported by all servers
    }

    const latency = Date.now() - startTime;

    return {
      success: true,
      tools: toolNames,
      resources: resourceNames,
      latency_ms: latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    return {
      success: false,
      tools: [],
      resources: [],
      latency_ms: latency,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Validate MCP server URL
 */
export function validateMCPUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    
    // Must be HTTPS for remote servers (allow HTTP for localhost in dev)
    if (parsed.protocol !== 'https:' && !parsed.hostname.includes('localhost')) {
      return { valid: false, error: 'URL must use HTTPS for remote servers' };
    }

    // Must have a path (typically /mcp or /sse)
    if (!parsed.pathname || parsed.pathname === '/') {
      return { valid: false, error: 'URL should include the MCP endpoint path (e.g., /mcp)' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
