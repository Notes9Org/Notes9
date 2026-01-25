// MCP OAuth Client for Catalyst AI
// Handles OAuth authentication for protected MCP servers like BioMCP

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  CallToolRequest,
  ListToolsRequest,
  CallToolResultSchema,
  ListToolsResultSchema,
  ListToolsResult,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import {
  OAuthClientProvider,
  UnauthorizedError,
} from '@modelcontextprotocol/sdk/client/auth.js';

/**
 * In-memory OAuth provider that implements the MCP OAuthClientProvider interface
 */
class InMemoryOAuthClientProvider implements OAuthClientProvider {
  private _clientInformation?: OAuthClientInformationFull;
  private _tokens?: OAuthTokens;
  private _codeVerifier?: string;
  private _onRedirect: (url: URL) => void;

  constructor(
    private readonly _redirectUrl: string | URL,
    private readonly _clientMetadata: OAuthClientMetadata,
    onRedirect?: (url: URL) => void
  ) {
    this._onRedirect = onRedirect || ((url) => {
      console.log(`Redirect to: ${url.toString()}`);
    });
  }

  get redirectUrl(): string | URL {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this._clientMetadata;
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    this._clientInformation = clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this._onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this._codeVerifier) {
      throw new Error('No code verifier saved');
    }
    return this._codeVerifier;
  }

  // Methods to get/set tokens for persistence
  getTokens(): OAuthTokens | undefined {
    return this._tokens;
  }

  setTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
  }

  getClientInfo(): OAuthClientInformationFull | undefined {
    return this._clientInformation;
  }

  setClientInfo(info: OAuthClientInformationFull): void {
    this._clientInformation = info;
  }
}

/**
 * MCP OAuth Client - handles OAuth flow and tool calls
 */
export class MCPOAuthClient {
  private client: Client | null = null;
  private oauthProvider: InMemoryOAuthClientProvider | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(
    private serverUrl: string,
    private callbackUrl: string,
    private onRedirect: (url: string) => void
  ) {}

  /**
   * Connect to MCP server, initiating OAuth if required
   */
  async connect(): Promise<void> {
    const clientMetadata: OAuthClientMetadata = {
      client_name: 'Notes9 Catalyst AI',
      redirect_uris: [this.callbackUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      scope: 'mcp:tools',
    };

    this.oauthProvider = new InMemoryOAuthClientProvider(
      this.callbackUrl,
      clientMetadata,
      (redirectUrl: URL) => {
        this.onRedirect(redirectUrl.toString());
      }
    );

    this.client = new Client(
      {
        name: 'notes9-catalyst-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await this.attemptConnection();
  }

  /**
   * Connect with existing tokens (for reconnection)
   */
  async connectWithTokens(tokens: OAuthTokens, clientInfo?: OAuthClientInformationFull): Promise<void> {
    const clientMetadata: OAuthClientMetadata = {
      client_name: 'Notes9 Catalyst AI',
      redirect_uris: [this.callbackUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      scope: 'mcp:tools',
    };

    this.oauthProvider = new InMemoryOAuthClientProvider(
      this.callbackUrl,
      clientMetadata
    );

    // Set existing tokens
    this.oauthProvider.setTokens(tokens);
    if (clientInfo) {
      this.oauthProvider.setClientInfo(clientInfo);
    }

    this.client = new Client(
      {
        name: 'notes9-catalyst-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await this.attemptConnection();
  }

  private async attemptConnection(): Promise<void> {
    if (!this.client || !this.oauthProvider) {
      throw new Error('Client not initialized');
    }

    const baseUrl = new URL(this.serverUrl);
    this.transport = new StreamableHTTPClientTransport(baseUrl, {
      authProvider: this.oauthProvider,
    });

    try {
      await this.client.connect(this.transport);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw new Error('OAuth authorization required');
      } else {
        throw error;
      }
    }
  }

  /**
   * Complete OAuth flow with authorization code
   */
  async finishAuth(authCode: string): Promise<OAuthTokens | undefined> {
    if (!this.client || !this.oauthProvider) {
      throw new Error('Client not initialized');
    }

    const baseUrl = new URL(this.serverUrl);
    this.transport = new StreamableHTTPClientTransport(baseUrl, {
      authProvider: this.oauthProvider,
    });

    await this.transport.finishAuth(authCode);
    await this.client.connect(this.transport);

    // Return tokens for storage
    return this.oauthProvider.getTokens();
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<ListToolsResult> {
    if (!this.client) {
      throw new Error('Not connected to server');
    }

    const request: ListToolsRequest = {
      method: 'tools/list',
      params: {},
    };

    return await this.client.request(request, ListToolsResultSchema);
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(
    toolName: string,
    toolArgs: Record<string, unknown>
  ): Promise<CallToolResult> {
    if (!this.client) {
      throw new Error('Not connected to server');
    }

    const request: CallToolRequest = {
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolArgs,
      },
    };

    return await this.client.request(request, CallToolResultSchema);
  }

  /**
   * Get current tokens for persistence
   */
  getTokens(): OAuthTokens | undefined {
    return this.oauthProvider?.getTokens();
  }

  /**
   * Get client information for persistence
   */
  getClientInfo(): OAuthClientInformationFull | undefined {
    return this.oauthProvider?.getClientInfo();
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    this.client = null;
    this.oauthProvider = null;
    this.transport = null;
  }
}

/**
 * Session store for managing OAuth clients across requests
 */
class MCPSessionStore {
  private clients = new Map<string, MCPOAuthClient>();

  setClient(sessionId: string, client: MCPOAuthClient): void {
    this.clients.set(sessionId, client);
  }

  getClient(sessionId: string): MCPOAuthClient | null {
    return this.clients.get(sessionId) || null;
  }

  removeClient(sessionId: string): void {
    const client = this.clients.get(sessionId);
    if (client) {
      client.disconnect();
      this.clients.delete(sessionId);
    }
  }

  generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

// Export singleton session store
export const mcpSessionStore = new MCPSessionStore();
