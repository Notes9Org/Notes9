import { streamText, smoothStream, stepCountIs, convertToModelMessages } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMCPClient } from '@ai-sdk/mcp';
import { DEFAULT_MODEL_ID, getModelById } from '@/lib/ai/models';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages: rawMessages, modelId } = await req.json();

  console.log('[Chat] Received request with', rawMessages.length, 'messages');
  
  // Convert UI messages to model messages (v6 format change)
  const messages = await convertToModelMessages(rawMessages);
  console.log('[Chat] Converted messages:', messages.length);

  // Get selected model or default
  const selectedModelId = modelId || DEFAULT_MODEL_ID;
  const modelConfig = getModelById(selectedModelId);
  console.log('[Chat] Using model:', modelConfig?.id || DEFAULT_MODEL_ID);

  // Create Google provider with GEMINI_API_KEY
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
  const model = google(modelConfig?.id || DEFAULT_MODEL_ID);

  // Get user's enabled MCP servers
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mcpTools: Record<string, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mcpClients: any[] = [];

  if (user) {
    console.log('[MCP] User authenticated, loading MCP servers...');
    try {
      const { data: mcpServers } = await supabase
        .from('mcp_servers')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_enabled', true);

      console.log('[MCP] Found', mcpServers?.length || 0, 'enabled MCP servers');

      // Connect to each enabled MCP server and get tools
      if (mcpServers && mcpServers.length > 0) {
        for (const server of mcpServers) {
          try {
            console.log(`[MCP] Connecting to ${server.name} at ${server.url}...`);
            const client = await createMCPClient({
              transport: {
                type: server.transport_type as 'http' | 'sse',
                url: server.url,
                headers: server.headers || {},
              },
            });

            mcpClients.push(client);
            const tools = await client.tools();
            
            // Log each tool with its description
            console.log(`[MCP] Tools from ${server.name}:`);
            for (const [toolName, tool] of Object.entries(tools)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const toolDesc = (tool as any).description || 'No description';
              console.log(`  - ${toolName}: ${toolDesc}`);
              
              // Add tool with server prefix
              const prefix = server.name.toLowerCase().replace(/\s+/g, '_');
              mcpTools[`${prefix}_${toolName}`] = tool;
            }

            console.log(`[MCP] ✓ Connected to ${server.name}, loaded ${Object.keys(tools).length} tools`);
          } catch (error) {
            console.error(`[MCP] ✗ Failed to connect to ${server.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[MCP] Error loading MCP servers:', error);
    }
  } else {
    console.log('[MCP] No authenticated user, skipping MCP servers');
  }

  const hasMcpTools = Object.keys(mcpTools).length > 0;
  const toolNames = Object.keys(mcpTools);
  console.log('[Chat] Has MCP tools:', hasMcpTools, '| Tools:', toolNames.join(', ') || 'none');

  // Build system prompt with explicit tool instructions
  const toolList = toolNames.map(name => `- ${name}`).join('\n');
  const systemPrompt = `You are Catalyst, an AI research assistant for Notes9 - a scientific lab documentation platform.

${hasMcpTools ? `IMPORTANT: You have access to the following tools that you MUST use when relevant:
${toolList}

When the user asks about time, weather, or any topic that matches a tool's capability, you MUST call the appropriate tool to get real-time information. Do NOT say you cannot access real-time information - USE THE TOOLS!` : ''}

Your capabilities:
- Answer questions about experiments and protocols
- Help with chemistry and biochemistry calculations
- Assist with scientific writing and documentation
- Explain complex scientific concepts

Guidelines:
- Use proper scientific terminology
- Format chemical formulas correctly (H₂O, CO₂, CH₃COOH, etc.)
- Be precise and accurate with scientific information
- When unsure, acknowledge limitations
- Keep responses clear and helpful`;

  // Close MCP clients helper
  const closeMcpClients = async () => {
    console.log('[MCP] Closing', mcpClients.length, 'MCP client connections...');
    for (const client of mcpClients) {
      try {
        await client.close();
      } catch {
        // Ignore close errors
      }
    }
    console.log('[MCP] All connections closed');
  };

  console.log('[Chat] Calling streamText with tools:', hasMcpTools);

  const result = hasMcpTools
    ? streamText({
        model,
        system: systemPrompt,
        messages, // AI SDK v6 accepts messages directly
        tools: mcpTools,
        toolChoice: 'auto',
        // Allow up to 3 steps: initial -> tool call -> response with tool result
        stopWhen: stepCountIs(3),
        experimental_transform: smoothStream({ chunking: 'word' }),
        onStepFinish: (event) => {
          console.log(`[Chat] Step finished, reason: ${event.finishReason}`);
          if (event.toolCalls && event.toolCalls.length > 0) {
            for (const call of event.toolCalls) {
              console.log(`[Chat] Tool called: ${call.toolName}`, call.input);
            }
          }
          if (event.toolResults && event.toolResults.length > 0) {
            for (const toolResult of event.toolResults) {
              console.log(`[Chat] Tool result for ${toolResult.toolName}:`, toolResult.output);
            }
          }
        },
        onFinish: async (event) => {
          console.log('[Chat] Stream finished');
          console.log('[Chat] Steps completed:', event.steps?.length || 1);
          console.log('[Chat] Final text length:', event.text?.length || 0);
          await closeMcpClients();
        },
      })
    : streamText({
        model,
        system: systemPrompt,
        messages,
        experimental_transform: smoothStream({ chunking: 'word' }),
        onFinish: async () => {
          console.log('[Chat] Stream finished (no tools)');
        },
      });

  return result.toUIMessageStreamResponse();
}
