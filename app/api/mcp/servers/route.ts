import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { MCPServerCreate, MCPServerUpdate } from '@/lib/mcp/types';

// GET /api/mcp/servers - List all MCP servers for current user
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('mcp_servers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching MCP servers:', error);
      return NextResponse.json({ error: 'Failed to fetch servers' }, { status: 500 });
    }

    return NextResponse.json({ servers: data });
  } catch (error) {
    console.error('Error in GET /api/mcp/servers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/mcp/servers - Create a new MCP server
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: MCPServerCreate = await req.json();

    // Validate required fields
    if (!body.name || !body.url || !body.transport_type) {
      return NextResponse.json(
        { error: 'Missing required fields: name, url, transport_type' },
        { status: 400 }
      );
    }

    // Validate transport type
    if (!['http', 'sse'].includes(body.transport_type)) {
      return NextResponse.json(
        { error: 'Invalid transport_type. Must be "http" or "sse"' },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(body.url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('mcp_servers')
      .insert({
        user_id: user.id,
        name: body.name,
        description: body.description || null,
        transport_type: body.transport_type,
        url: body.url,
        headers: body.headers || {},
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A server with this name already exists' },
          { status: 409 }
        );
      }
      console.error('Error creating MCP server:', error);
      return NextResponse.json({ error: 'Failed to create server' }, { status: 500 });
    }

    return NextResponse.json({ server: data }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/mcp/servers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/mcp/servers - Update an MCP server
export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: MCPServerUpdate & { id: string } = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Missing server id' }, { status: 400 });
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.transport_type !== undefined) updates.transport_type = body.transport_type;
    if (body.url !== undefined) updates.url = body.url;
    if (body.headers !== undefined) updates.headers = body.headers;
    if (body.is_enabled !== undefined) updates.is_enabled = body.is_enabled;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('mcp_servers')
      .update(updates)
      .eq('id', body.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating MCP server:', error);
      return NextResponse.json({ error: 'Failed to update server' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    return NextResponse.json({ server: data });
  } catch (error) {
    console.error('Error in PATCH /api/mcp/servers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/mcp/servers - Delete an MCP server
export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const serverId = searchParams.get('id');

    if (!serverId) {
      return NextResponse.json({ error: 'Missing server id' }, { status: 400 });
    }

    const { error } = await supabase
      .from('mcp_servers')
      .delete()
      .eq('id', serverId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting MCP server:', error);
      return NextResponse.json({ error: 'Failed to delete server' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/mcp/servers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
