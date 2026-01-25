// MCP (Model Context Protocol) Types for Catalyst AI

export interface MCPServer {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  transport_type: 'http' | 'sse';
  url: string;
  headers: Record<string, string>;
  is_enabled: boolean;
  last_connected_at: string | null;
  connection_status: 'connected' | 'disconnected' | 'error' | 'unknown';
  error_message: string | null;
  tools_count: number;
  resources_count: number;
  created_at: string;
  updated_at: string;
  // OAuth fields
  requires_auth: boolean;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expires_at: string | null;
  oauth_scopes: string | null;
}

export interface MCPServerCreate {
  name: string;
  description?: string;
  transport_type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface MCPServerUpdate {
  name?: string;
  description?: string;
  transport_type?: 'http' | 'sse';
  url?: string;
  headers?: Record<string, string>;
  is_enabled?: boolean;
}

export interface MCPConnectionTestResult {
  success: boolean;
  tools: string[];
  resources: string[];
  latency_ms: number;
  error?: string;
}

export interface MCPToolInfo {
  name: string;
  description?: string;
  server_name: string;
  server_id: string;
}

// Preset MCP servers that users can easily add
export interface MCPServerPreset {
  name: string;
  description: string;
  url: string;
  transport_type: 'http' | 'sse';
  icon: string; // Emoji or icon name
  category: string;
}

export const MCP_SERVER_PRESETS: MCPServerPreset[] = [
  // These are example presets - actual MCP server URLs would need to be real
  // Users can add their own custom servers
];

// Transport type options for UI
export const TRANSPORT_TYPES = [
  { value: 'http', label: 'HTTP (Recommended)', description: 'Standard HTTP transport, best for production' },
  { value: 'sse', label: 'SSE', description: 'Server-Sent Events, alternative HTTP-based transport' },
] as const;
