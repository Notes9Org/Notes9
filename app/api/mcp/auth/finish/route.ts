import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mcpSessionStore } from '@/lib/mcp/oauth-client';

interface FinishAuthRequestBody {
  authCode: string;
  sessionId: string;
  serverId?: string;
}

// POST /api/mcp/auth/finish - Complete OAuth flow
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: FinishAuthRequestBody = await request.json();
    const { authCode, sessionId, serverId } = body;

    if (!authCode || !sessionId) {
      return NextResponse.json(
        { error: 'Authorization code and session ID are required' },
        { status: 400 }
      );
    }

    const client = mcpSessionStore.getClient(sessionId);
    if (!client) {
      return NextResponse.json(
        { error: 'No active OAuth session found' },
        { status: 400 }
      );
    }

    // Complete OAuth flow
    const tokens = await client.finishAuth(authCode);

    // Get tools to verify connection
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools?.map(t => t.name) || [];

    // If we have a serverId, update the database with tokens
    if (serverId && tokens) {
      await supabase
        .from('mcp_servers')
        .update({
          requires_auth: true,
          oauth_access_token: tokens.access_token,
          oauth_refresh_token: tokens.refresh_token,
          oauth_token_expires_at: tokens.expires_in 
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
          connection_status: 'connected',
          last_connected_at: new Date().toISOString(),
          tools_count: tools.length,
          error_message: null,
        })
        .eq('id', serverId)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      success: true,
      tools,
      serverId,
    });
  } catch (error: unknown) {
    console.error('Error in POST /api/mcp/auth/finish:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to complete authentication' },
      { status: 500 }
    );
  }
}
