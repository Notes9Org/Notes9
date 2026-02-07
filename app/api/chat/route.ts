import { streamText, smoothStream, CoreMessage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { DEFAULT_MODEL_ID, getModelById } from '@/lib/ai/models';
import { getRecentChatContext, updateChatContext, ChatMessage } from '@/lib/redis';
import { saveChatMessage, getChatHistory } from '@/lib/db/chat';

export const maxDuration = 60;

/** Unwrap stringified JSON parts (e.g. [{"type":"text","text":"..."}]) to plain text. Handles double/triple wrapping. */
function normalizeContentToPlainText(raw: string): string {
  let s = raw?.trim() ?? '';
  const maxUnwrap = 5;
  for (let i = 0; i < maxUnwrap; i++) {
    if (!s || !s.startsWith('[') || !s.includes('"type"') || !s.includes('"text"')) break;
    try {
      const parsed = JSON.parse(s) as Array<{ type?: string; text?: string }>;
      if (!Array.isArray(parsed)) break;
      const text = parsed
        .filter((p) => p?.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text!)
        .join('');
      if (text === s) break;
      s = text;
    } catch {
      break;
    }
  }
  return s;
}

export async function POST(req: Request) {
  const body = await req.json();
  console.log('API Request Body:', JSON.stringify(body, null, 2));
  const { messages, modelId, sessionId } = body;

  if (!sessionId) {
    console.error('Missing session_id. Body:', body);
    return new Response('Missing session_id', { status: 400 });
  }

  // Get selected model or default
  const selectedModelId = modelId || DEFAULT_MODEL_ID;
  const modelConfig = getModelById(selectedModelId);

  // Create Google provider with GEMINI_API_KEY
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
  const model = google(modelConfig?.id || DEFAULT_MODEL_ID);

  // 1. Extract the latest user query (always plain text for consistent context)
  const lastMessage = messages[messages.length - 1];
  let userQuery = '';
  if (typeof lastMessage.content === 'string') {
    userQuery = normalizeContentToPlainText(lastMessage.content);
  }
  if (!userQuery && Array.isArray(lastMessage.parts)) {
    const fromParts = lastMessage.parts
      .filter((p: { type?: string; text?: string }) => p.type === 'text' && typeof p.text === 'string')
      .map((p: { text: string }) => normalizeContentToPlainText(p.text))
      .join('\n');
    if (fromParts) userQuery = fromParts;
  }
  if (!userQuery) {
    userQuery = normalizeContentToPlainText(JSON.stringify(lastMessage.content || ''));
  }

  // 2. Persist user message immediately (DB)
  // We don't await this to block the UI, but for correctness/safety we often should.
  // Given the user wants robust context, let's await it to ensure it's recorded.
  await saveChatMessage(sessionId, 'user', userQuery);

  // 3. Fetch recent context (Redis -> DB Fallback)
  let contextMessages: ChatMessage[] | null = await getRecentChatContext(sessionId);

  if (!contextMessages) {
    // Fallback: Fetch from DB if Redis miss (cold start)
    contextMessages = await getChatHistory(sessionId, 10);
  }

  // 4. Assemble the LLM prompt (context as plain text so model never sees stringified JSON)
  const llmMessages: CoreMessage[] = [
    ...contextMessages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: normalizeContentToPlainText(msg.content),
    })),
    { role: 'user', content: userQuery },
  ];

  const result = streamText({
    model,
    system: `You are Catalyst, an AI research assistant for Notes9 - a scientific lab documentation platform.
You help scientists with their experiments, protocols, and research documentation.

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
- Keep responses clear and helpful`,
    messages: llmMessages,
    // Smooth streaming for better UX - chunks by word instead of token
    experimental_transform: smoothStream({ chunking: 'word' }),
    onFinish: async ({ response }) => {
      // 6. Persist assistant response (full plain text so DB and client never see truncated/JSON)
      const assistantMessage = response.messages[response.messages.length - 1];
      if (assistantMessage.role === 'assistant') {
        let content: string;
        const raw = assistantMessage.content;
        if (typeof raw === 'string') {
          content = normalizeContentToPlainText(raw);
        } else if (Array.isArray(raw)) {
          const joined = (raw as Array<{ type?: string; text?: string }>)
            .filter((p) => p?.type === 'text' && typeof p.text === 'string')
            .map((p) => p.text!)
            .join('');
          content = normalizeContentToPlainText(joined);
        } else {
          content = normalizeContentToPlainText(JSON.stringify(raw ?? ''));
        }

        await saveChatMessage(sessionId, 'assistant', content);

        // 7. Update Redis sliding window
        // We append the new user query and the new assistant response to the *existing* context
        const newUpdates: ChatMessage[] = [
          { role: 'user', content: userQuery },
          { role: 'assistant', content }
        ];

        await updateChatContext(sessionId, newUpdates);
      }
    }
  });

  return result.toUIMessageStreamResponse();
}
