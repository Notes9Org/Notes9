import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testMCPConnection, validateMCPUrl } from '@/lib/mcp/connector';

// POST /api/mcp/test - Test MCP server connection
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { url, transport_type, headers } = body;

    // Validate required fields
    if (!url || !transport_type) {
      return NextResponse.json(
        { error: 'Missing required fields: url, transport_type' },
        { status: 400 }
      );
    }

    // Validate transport type
    if (!['http', 'sse'].includes(transport_type)) {
      return NextResponse.json(
        { error: 'Invalid transport_type. Must be "http" or "sse"' },
        { status: 400 }
      );
    }

    // Validate URL format
    const urlValidation = validateMCPUrl(url);
    if (!urlValidation.valid) {
      return NextResponse.json(
        { 
          success: false,
          tools: [],
          resources: [],
          latency_ms: 0,
          error: urlValidation.error 
        },
        { status: 200 } // Return 200 with error in body for client to handle
      );
    }

    // Test the connection
    const result = await testMCPConnection(url, transport_type, headers);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /api/mcp/test:', error);
    return NextResponse.json(
      { 
        success: false,
        tools: [],
        resources: [],
        latency_ms: 0,
        error: 'Internal server error' 
      },
      { status: 500 }
    );
  }
}
