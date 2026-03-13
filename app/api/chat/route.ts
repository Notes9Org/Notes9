import { createUIMessageStream, createUIMessageStreamResponse, generateId } from 'ai';
import { updateChatContext, ChatMessage } from '@/lib/redis';
import { saveChatMessage } from '@/lib/db/chat';

export const maxDuration = 60;

const NOTES9_API_BASE = process.env.NEXT_PUBLIC_NOTES9_API_URL?.replace(/\/$/, '') || '';

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

/** Extract plain text from a message (AI SDK format). */
function getPlainTextFromMessage(msg: {
  content?: unknown;
  parts?: Array<{ type?: string; text?: string }>;
}): string {
  if (typeof msg.content === 'string') return normalizeContentToPlainText(msg.content);
  if (Array.isArray(msg.parts)) {
    const text = msg.parts
      .filter((p) => p?.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text!)
      .join('\n');
    if (text) return normalizeContentToPlainText(text);
  }
  return normalizeContentToPlainText(JSON.stringify(msg.content ?? ''));
}

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, sessionId, supabaseToken: bodyToken } = body;
  console.log('API Request Body:', JSON.stringify({ ...body, supabaseToken: bodyToken ? '[REDACTED]' : undefined }, null, 2));
  const headerToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const supabaseToken = bodyToken || headerToken;

  if (!sessionId) {
    console.error('Missing session_id. Body:', body);
    return new Response('Missing session_id', { status: 400 });
  }

  const baseUrl = process.env.AI_SERVICE_URL?.replace(/\/$/, '') || 'http://54.157.162.202:8000';
  const bearerToken = process.env.AI_SERVICE_BEARER_TOKEN;
  const useNotes9Fallback = !bearerToken && supabaseToken && NOTES9_API_BASE;

  if (!bearerToken && !useNotes9Fallback) {
    console.error('AI_SERVICE_BEARER_TOKEN is not configured and no Supabase token provided');
    return new Response(
      JSON.stringify({
        error: 'Chat service not configured. Use Notes9 mode or set AI_SERVICE_BEARER_TOKEN.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 1. Extract the latest user query
  const lastMessage = messages[messages.length - 1];
  const userQuery = getPlainTextFromMessage(lastMessage);

  // 2. Persist user message immediately (DB)
  await saveChatMessage(sessionId, 'user', userQuery);

  // 3. Build history for external API (prior turns, exclude last user message)
  const history = messages.slice(0, -1).map((msg: { role: string; content?: unknown; parts?: Array<{ type?: string; text?: string }> }) => ({
    role: msg.role as 'user' | 'assistant',
    content: getPlainTextFromMessage(msg),
  }));

  const stream = createUIMessageStream({
    originalMessages: messages,
    generateId,
    execute: async ({ writer }) => {
      try {
        let assistantContent: string;

        if (useNotes9Fallback) {
          const response = await fetch(`${NOTES9_API_BASE}/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseToken}`,
            },
            body: JSON.stringify({
              content: userQuery,
              history,
              session_id: sessionId,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error('Notes9 chat API error:', response.status, errText);
            writer.write({
              type: 'error',
              errorText: `Chat service error: ${response.status} ${errText}`,
            });
            return;
          }

          const data = (await response.json()) as { content?: string; role?: string };
          assistantContent = typeof data.content === 'string' ? data.content : String(data.content ?? '');
        } else {
          const response = await fetch(`${baseUrl}/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${bearerToken}`,
            },
            body: JSON.stringify({
              content: userQuery,
              history,
              session_id: sessionId,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            console.error('External chat API error:', response.status, errText);
            writer.write({
              type: 'error',
              errorText: `Chat service error: ${response.status} ${errText}`,
            });
            return;
          }

          const data = (await response.json()) as { content?: string; role?: string };
          assistantContent = typeof data.content === 'string' ? data.content : String(data.content ?? '');
        }

        // Persist assistant response (DB)
        await saveChatMessage(sessionId, 'assistant', assistantContent);

        // Update Redis sliding window
        const newUpdates: ChatMessage[] = [
          { role: 'user', content: userQuery },
          { role: 'assistant', content: assistantContent },
        ];
        await updateChatContext(sessionId, newUpdates);

        // Emit text as a single chunk (external API is non-streaming)
        const textId = generateId();
        writer.write({ type: 'text-start', id: textId });
        writer.write({ type: 'text-delta', id: textId, delta: assistantContent });
        writer.write({ type: 'text-end', id: textId });
      } catch (error) {
        console.error('Chat proxy error:', error);
        writer.write({
          type: 'error',
          errorText: error instanceof Error ? error.message : 'Chat service unavailable',
        });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
