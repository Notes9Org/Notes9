import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MCPOAuthClient, mcpSessionStore } from '@/lib/mcp/oauth-client';

interface ConnectRequestBody {
  serverUrl: string;
  callbackUrl: string;
  serverId?: string;
}

// POST /api/mcp/auth/connect - Initiate OAuth connection to MCP server
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ConnectRequestBody = await request.json();
    const { serverUrl, callbackUrl, serverId } = body;

    if (!serverUrl || !callbackUrl) {
      return NextResponse.json(
        { error: 'Server URL and callback URL are required' },
        { status: 400 }
      );
    }

    const sessionId = mcpSessionStore.generateSessionId();
    let authUrl: string | null = null;

    const client = new MCPOAuthClient(
      serverUrl,
      callbackUrl,
      (redirectUrl: string) => {
        authUrl = redirectUrl;
      }
    );

    try {
      await client.connect();
      
      // Connection succeeded without OAuth
      mcpSessionStore.setClient(sessionId, client);

      // Get tools to verify connection
      const toolsResult = await client.listTools();

      return NextResponse.json({
        success: true,
        sessionId,
        serverId,
        tools: toolsResult.tools?.map(t => t.name) || [],
        requiresAuth: false,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'OAuth authorization required' && authUrl) {
        // Store client for OAuth completion
        mcpSessionStore.setClient(sessionId, client);

        return NextResponse.json(
          {
            requiresAuth: true,
            authUrl,
            sessionId,
            serverId,
          },
          { status: 401 }
        );
      } else {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Connection failed' },
          { status: 500 }
        );
      }
    }
  } catch (error: unknown) {
    console.error('Error in POST /api/mcp/auth/connect:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
