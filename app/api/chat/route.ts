import { createUIMessageStream, createUIMessageStreamResponse, generateId } from 'ai';
import { updateChatContext, ChatMessage } from '@/lib/redis';
import {
  appendSourcesMarkdownSection,
  assistantContentFromNotes9ChatPayload,
  extractSourceListFromChatPayload,
} from '@/lib/chat-response-sources';
import {
  buildGeneralChatLegacyUpstreamBody,
  buildGeneralChatNotes9UpstreamBody,
  buildGeneralChatStreamNotes9UpstreamBody,
} from '@/lib/general-chat-request';
import { splitSseBuffer, parseSseDataJson } from '@/lib/sse-event-blocks';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { enforceLimits, checkBodyBytes, checkHistory, checkQueryChars } from '@/lib/limits/guards';
import { literatureContextToSystemMessage, type LiteratureSessionContext } from '@/lib/literature-citations';

export const maxDuration = 300;

const NOTES9_API_BASE = process.env.CHAT_API_URL?.replace(/\/$/, '') || '';

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
        .flatMap((p) =>
          p?.type === 'text' && typeof p.text === 'string' ? [p.text] : []
        )
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
      .flatMap((p) =>
        p?.type === 'text' && typeof p.text === 'string' ? [p.text] : []
      )
      .join('\n');
    if (text) return normalizeContentToPlainText(text);
  }
  return normalizeContentToPlainText(JSON.stringify(msg.content ?? ''));
}

export async function POST(req: Request) {
  // Auth gate. Previously the route accepted any caller — when
  // AI_SERVICE_BEARER_TOKEN is set in env, the handler proceeded without
  // verifying the user at all. An unauthenticated attacker could POST here
  // and burn LLM quota billed to the account. We verify the Supabase JWT
  // unconditionally now and only forward upstream once we know who's asking.
  // Pre-parse: check Content-Length header before buffering the body.
  const preParseBlocked = enforceLimits('chat', [checkBodyBytes(req)]);
  if (preParseBlocked) return preParseBlocked;

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const { messages, sessionId, webSearch } = body;

  // Post-parse: check field-level limits (history length, last message size).
  const postParseBlocked = enforceLimits('chat', [
    Array.isArray(messages) ? checkHistory(messages) : null,
    Array.isArray(messages) && messages.length > 0
      ? checkQueryChars(
          typeof messages[messages.length - 1]?.content === 'string'
            ? messages[messages.length - 1].content
            : ''
        )
      : null,
  ]);
  if (postParseBlocked) return postParseBlocked;
  const webSearchOn = webSearch === true;
  const rawResponseFormat = body.response_format ?? body.responseFormat;
  const notes9ResponseFormat =
    rawResponseFormat === 'json' || rawResponseFormat === 'text'
      ? rawResponseFormat
      : undefined;
  // PII redaction. Previously this logged the full body — including every
  // user message — to stdout, which on Vercel/CloudWatch persists indefinitely.
  // We now log only the lightweight envelope so debugging stays possible
  // without retaining user-authored research content.
  console.log('chat POST', {
    sessionId,
    messageCount: Array.isArray(messages) ? messages.length : 0,
    webSearch: webSearchOn,
    responseFormat: notes9ResponseFormat ?? 'default',
  });
  const supabaseToken = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() || null;

  if (!sessionId) {
    console.error('Missing session_id');
    return new Response('Missing session_id', { status: 400 });
  }

  const baseUrl = process.env.AI_SERVICE_URL?.replace(/\/$/, '') || NOTES9_API_BASE;
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

  // 3. Build history for external API (prior turns, exclude last user message)
  const history = messages.slice(0, -1).map((msg: { role: string; content?: unknown; parts?: Array<{ type?: string; text?: string }> }) => ({
    role: msg.role as 'user' | 'assistant',
    content: getPlainTextFromMessage(msg),
  }));

  // C7: For literature sessions, prepend a system message so follow-up turns are
  // grounded in the papers that were surfaced.  Fail-open — any error is ignored.
  // Cast to wider type only for the unshift; downstream build functions still
  // receive the narrowed type and pass the array through to the JSON body as-is.
  try {
    const { data: sessionRow } = await supabase
      .from('chat_sessions')
      .select('kind, metadata')
      .eq('id', sessionId)
      .single();
    if (
      sessionRow?.kind === 'literature' &&
      sessionRow?.metadata &&
      typeof sessionRow.metadata === 'object' &&
      'literature' in (sessionRow.metadata as Record<string, unknown>)
    ) {
      const litCtx = (sessionRow.metadata as Record<string, unknown>).literature as LiteratureSessionContext;
      const systemContent = literatureContextToSystemMessage(litCtx);
      if (systemContent) {
        (history as Array<{ role: string; content: string }>).unshift({ role: 'system', content: systemContent });
      }
    }
  } catch {
    // Fail open: missing metadata must never block the chat.
  }

  const stream = createUIMessageStream({
    originalMessages: messages,
    generateId,
    execute: async ({ writer }) => {
      try {
        let assistantContent: string;

        if (useNotes9Fallback) {
          const useStream =
            process.env.NOTES9_CHAT_USE_JSON !== 'true' &&
            process.env.NEXT_PUBLIC_NOTES9_CHAT_USE_JSON !== 'true';

          if (useStream) {
            const skipClarify =
              body.skip_clarify === true || body.chat_options?.skip_clarify === true;
            const _upstream_ctrl = new AbortController();
            const _upstream_timeout = setTimeout(() => _upstream_ctrl.abort(), 90_000);
            const _upstreamStart = Date.now();
            try {
            const response = await fetch(`${NOTES9_API_BASE}/chat/stream`, {
              method: 'POST',
              signal: _upstream_ctrl.signal,
              headers: {
                Accept: 'text/event-stream',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseToken}`,
              },
              body: JSON.stringify(
                buildGeneralChatStreamNotes9UpstreamBody({
                  content: userQuery,
                  session_id: sessionId,
                  history,
                  web_search: webSearchOn ? 'on' : 'off',
                  skip_clarify: skipClarify,
                })
              ),
            });

            console.log(JSON.stringify({ event: 'ai_upstream_complete', route: 'chat/stream', duration_ms: Date.now() - _upstreamStart, status: response.status, sessionId }));

            if (!response.ok) {
              const errText = await response.text();
              console.error('Notes9 chat/stream API error:', response.status, errText);
              writer.write({
                type: 'error',
                errorText: `Chat service error: ${response.status} ${errText}`,
              });
              return;
            }

            if (!response.body) {
              writer.write({
                type: 'error',
                errorText: 'Chat service returned an empty body',
              });
              return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';
            let errored = false;
            assistantContent = '';
            const sourceItems: unknown[] = [];
            const textId = generateId();
            let textOpen = false;

            const ensureTextOpen = () => {
              if (!textOpen) {
                writer.write({ type: 'text-start', id: textId });
                textOpen = true;
              }
            };

            function clarifyMarkdownFromPayload(payload: Record<string, unknown> | null): string {
              if (!payload) return '';
              const q =
                typeof payload.question === 'string'
                  ? payload.question
                  : 'Please provide more detail.';
              const opts = Array.isArray(payload.options)
                ? payload.options.filter((o): o is string => typeof o === 'string')
                : [];
              const lines = ['> **More information needed**', '>', `> ${q}`];
              for (const o of opts) lines.push(`> - ${o}`);
              return `${lines.join('\n')}\n\n`;
            }

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              sseBuffer += decoder.decode(value, { stream: true });
              const { blocks, rest } = splitSseBuffer(sseBuffer);
              sseBuffer = rest;

              for (const block of blocks) {
                const payload = parseSseDataJson(block.data);

                switch (block.event) {
                  case 'ping':
                    break;
                  case 'thinking': {
                    // Forward thinking events to UI via custom message annotation
                    const thinkingText = typeof payload?.text === 'string'
                      ? payload.text
                      : typeof payload?.thinking === 'string'
                        ? payload.thinking
                        : null;
                    if (thinkingText) {
                      ensureTextOpen();
                      // Emit as a special annotation that frontend can parse
                      writer.write({
                        type: 'data-thinking',
                        data: { thinking: thinkingText, event: 'thinking' },
                      });
                    }
                    break;
                  }
                  case 'token': {
                    const t =
                      typeof payload?.text === 'string'
                        ? payload.text
                        : typeof (payload as { token?: string } | null)?.token === 'string'
                          ? (payload as { token: string }).token
                          : '';
                    if (t) {
                      assistantContent += t;
                      ensureTextOpen();
                      writer.write({ type: 'text-delta', id: textId, delta: t });
                    }
                    break;
                  }
                  case 'source': {
                    if (payload && typeof payload === 'object') {
                      sourceItems.push(payload);
                      // Also forward sources incrementally for progressive citation display
                      ensureTextOpen();
                      writer.write({
                        type: 'data-source',
                        data: { source: payload, event: 'source' },
                      });
                    }
                    break;
                  }
                  // Forward tool lifecycle events so the modal chat can render
                  // Cursor/Claude-style inline tool cards (status, args, result).
                  // Mirrors the shape the full-page agent stream consumes.
                  case 'tool_start':
                  case 'tool_call':
                  case 'tool_result':
                  case 'tool_output': {
                    if (payload && typeof payload === 'object') {
                      ensureTextOpen();
                      writer.write({
                        type: 'data-tool',
                        data: { event: block.event, payload },
                      });
                    }
                    break;
                  }
                  case 'clarify': {
                    const md = clarifyMarkdownFromPayload(payload);
                    if (md) {
                      assistantContent += md;
                      ensureTextOpen();
                      writer.write({ type: 'text-delta', id: textId, delta: md });
                    }
                    break;
                  }
                  case 'error': {
                    errored = true;
                    const msg =
                      typeof payload?.message === 'string'
                        ? payload.message
                        : typeof payload?.error === 'string'
                          ? payload.error
                          : 'Chat stream error';
                    writer.write({ type: 'error', errorText: msg });
                    break;
                  }
                  case 'done':
                    break;
                  default:
                    break;
                }
              }
            }

            if (errored) return;

            const pseudoPayload: Record<string, unknown> = { sources: sourceItems };
            const searchedWebFlag = webSearchOn && sourceItems.length > 0;
            if (webSearchOn && sourceItems.length === 0) {
              console.warn('[chat/stream] web_search=on but no source events were received');
            }
            const withSources = appendSourcesMarkdownSection(
              assistantContent,
              extractSourceListFromChatPayload(pseudoPayload),
              { searchedWeb: searchedWebFlag }
            );
            const sourcesSuffix = withSources.slice(assistantContent.length);
            if (sourcesSuffix) {
              ensureTextOpen();
              writer.write({ type: 'text-delta', id: textId, delta: sourcesSuffix });
            }
            assistantContent = withSources;

            if (textOpen) {
              writer.write({ type: 'text-end', id: textId });
            }
            } finally {
              clearTimeout(_upstream_timeout);
            }
          } else {
            const response = await fetch(`${NOTES9_API_BASE}/chat`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${supabaseToken}`,
              },
              body: JSON.stringify(
                buildGeneralChatNotes9UpstreamBody({
                  content: userQuery,
                  session_id: sessionId,
                  history,
                  web_search: webSearchOn ? 'on' : 'off',
                  response_format: notes9ResponseFormat,
                })
              ),
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

            const data = (await response.json()) as Record<string, unknown> & {
              content?: string;
              role?: string;
            };
            assistantContent = assistantContentFromNotes9ChatPayload(data);
            const sources = extractSourceListFromChatPayload(data);
            const searchedWebFlag = data.searched_web === true;
            if (webSearchOn && sources.length === 0 && !searchedWebFlag) {
              console.warn(
                '[chat] web_search=on but upstream JSON had no sources/resources/citations and searched_web was not true'
              );
            }
            assistantContent = appendSourcesMarkdownSection(assistantContent, sources, {
              searchedWeb: searchedWebFlag,
            });

            const textIdJson = generateId();
            writer.write({ type: 'text-start', id: textIdJson });
            writer.write({ type: 'text-delta', id: textIdJson, delta: assistantContent });
            writer.write({ type: 'text-end', id: textIdJson });
          }
        } else {
          const response = await fetch(`${baseUrl}/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${bearerToken}`,
            },
            body: JSON.stringify(
              buildGeneralChatLegacyUpstreamBody({
                content: userQuery,
                session_id: sessionId,
                history,
                webSearchOn,
              })
            ),
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

          const data = (await response.json()) as Record<string, unknown> & {
            content?: string;
            role?: string;
          };
          assistantContent = assistantContentFromNotes9ChatPayload(data);
          const sources = extractSourceListFromChatPayload(data);
          const searchedWebFlag = data.searched_web === true;
          assistantContent = appendSourcesMarkdownSection(assistantContent, sources, {
            searchedWeb: searchedWebFlag,
          });
        }

        // Update Redis sliding window
        const newUpdates: ChatMessage[] = [
          { role: 'user', content: userQuery },
          { role: 'assistant', content: assistantContent },
        ];
        await updateChatContext(sessionId, newUpdates);

        // Notes9 paths already streamed to the client (JSON or SSE). Legacy service: single chunk.
        if (!useNotes9Fallback && assistantContent && assistantContent.length > 0) {
          const legacyTextId = generateId();
          writer.write({ type: 'text-start', id: legacyTextId });
          writer.write({ type: 'text-delta', id: legacyTextId, delta: assistantContent });
          writer.write({ type: 'text-end', id: legacyTextId });
        }
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
