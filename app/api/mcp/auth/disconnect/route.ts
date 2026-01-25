import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mcpSessionStore } from '@/lib/mcp/oauth-client';

interface DisconnectRequestBody {
  sessionId?: string;
  serverId?: string;
}

// POST /api/mcp/auth/disconnect - Disconnect from MCP server
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: DisconnectRequestBody = await request.json();
    const { sessionId, serverId } = body;

    // Clean up session if provided
    if (sessionId) {
      mcpSessionStore.removeClient(sessionId);
    }

    // Update database if serverId provided
    if (serverId) {
      await supabase
        .from('mcp_servers')
        .update({
          connection_status: 'disconnected',
          oauth_access_token: null,
          oauth_refresh_token: null,
          oauth_token_expires_at: null,
        })
        .eq('id', serverId)
        .eq('user_id', user.id);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error in POST /api/mcp/auth/disconnect:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Disconnect failed' },
      { status: 500 }
    );
  }
}
