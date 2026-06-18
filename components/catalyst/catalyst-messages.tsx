'use client';

import { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UIMessage } from 'ai';
import { Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from './markdown-renderer';
import { MessageActions } from './message-actions';
import { MessageEditor } from './message-editor';
import { AgentStreamReply } from './agent-stream-reply';
import { usePinnedAutoScroll } from '@/hooks/use-pinned-auto-scroll';
import {
  AgentCitationsPanel,
  groundingResourceToPanelItem,
} from '@/components/catalyst/agent-citations-panel';
import { PersistedArtifactList } from '@/components/catalyst/agent-artifact-card';
import { AgentGraphList } from '@/components/catalyst/agent-graph-view';
import type { PersistedArtifact } from '@/lib/agent-artifacts';
import { parseNotes9AssistantStoredContent } from '@/lib/notes9-chat-format';
import type { Vote } from '@/lib/db/schema';
import type { ThinkingPayload, RagChunksPayload, DonePayload, GroundingResource } from '@/lib/agent-stream-types';
import type { CitationsManifest, ToolCard, AgentArtifact, AgentGraph, CitationsManifestEntry } from '@/hooks/use-agent-stream';

interface CatalystMessagesProps {
  messages: UIMessage[];
  getMessageContent: (message: UIMessage) => string;
  isLoading: boolean;
  sessionId: string | null;
  votes?: Vote[];
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate?: () => void;
  /** Stop an in-flight model request (same as input stop). */
  onStop?: () => void;
  /** When Notes9 stream is active, show AgentStreamReply instead of generic thinking indicator */
  notes9Stream?: {
    thinkingSteps: ThinkingPayload[];
    toolCards?: ToolCard[];
    artifacts?: AgentArtifact[];
    graphs?: AgentGraph[];
    thinkingTokenBuffer?: string;
    sql: string | null;
    ragChunks: RagChunksPayload | null;
    streamedAnswer: string;
    donePayload: DonePayload | null;
    citationsManifest?: CitationsManifest | null;
    error: string | null;
    isStreaming: boolean;
    /** Live source count from `citations_update` events — drives the ticker. */
    liveCitationCount?: number;
    /** Server-side cancel handle from `run_started` (HITL) — shows Stop button. */
    runId?: string | null;
    /** Cancels the in-flight run + stream. */
    onStop?: () => void;
  } | null;
}

export function CatalystMessages({
  messages,
  getMessageContent,
  isLoading,
  sessionId,
  votes = [],
  onEditMessage,
  onRegenerate,
  onStop,
  notes9Stream,
}: CatalystMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  // Smart auto-scroll — only follows when the user is pinned to the bottom.
  // Scrolling up immediately releases the pin so the user can read previous
  // content while streaming, and the "↓" button below re-pins on click.
  const { onScroll, scrollToBottom, showJumpBottom } = usePinnedAutoScroll(
    scrollRef,
    [
      messages,
      notes9Stream?.streamedAnswer,
      notes9Stream?.thinkingSteps?.length,
      notes9Stream?.donePayload,
      notes9Stream?.isStreaming,
    ],
    { smooth: false },
  );

  const getVoteForMessage = useCallback(
    (messageId: string): Vote | undefined => {
      return votes.find((v) => v.messageId === messageId);
    },
    [votes]
  );

  const handleEditSave = async (messageId: string, newContent: string) => {
    if (onEditMessage) {
      await onEditMessage(messageId, newContent);
    }
    setEditingMessageId(null);
  };

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]"
        onScroll={onScroll}
        role="log"
        aria-label="Chat messages"
      >
        <div className="mx-auto max-w-5xl 2xl:max-w-6xl px-4 pt-6 pb-4">
          <div className="flex flex-col gap-5">
          {messages.map((message, index) => {
            const isEditing = editingMessageId === message.id;
            const content = getMessageContent(message);
            const getMessageSources = (msg: typeof message): Array<Record<string, unknown>> => {
              if (!msg.parts) return [];
              return msg.parts
                .filter((p): p is { type: 'data-source'; data: { source: Record<string, unknown> } } =>
                  (p as { type: string }).type === 'data-source'
                )
                .map((p) => (p as { type: string; data: { source: Record<string, unknown> } }).data?.source)
                .filter(Boolean) as Array<Record<string, unknown>>;
            };
            const isLastAssistant =
              message.role === 'assistant' && index === messages.length - 1;
            const isLastUserAwaitingReply =
              isLoading &&
              message.role === 'user' &&
              index === messages.length - 1;

            const notes9Parsed =
              message.role === 'assistant'
                ? parseNotes9AssistantStoredContent(content)
                : null;
            // Prefer structured metadata.artifacts (Phase 0); fall back to the
            // legacy parsed markdown block for messages saved before this change.
            const messageArtifacts =
              (message as { metadata?: { artifacts?: PersistedArtifact[] } }).metadata?.artifacts
              ?? notes9Parsed?.artifacts
              ?? [];
            // Persisted relationship graphs (metadata.graphs) — re-rendered
            // natively so they don't vanish when the live stream tears down.
            const messageGraphs =
              (message as { metadata?: { graphs?: AgentGraph[] } }).metadata?.graphs ?? [];
            const assistantDisplayMarkdown =
              message.role === 'assistant' && notes9Parsed
                ? notes9Parsed.bodyMarkdown
                : content;
            const notes9Sources =
              notes9Parsed && notes9Parsed.resources.length > 0
                ? notes9Parsed.resources
                : null;

            return (
              <div
                key={message.id}
                className={cn(
                  'group/message flex w-full gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {/* Assistant Avatar */}
                {message.role === 'assistant' && (
                  <img
                    src="/notes9-logo-mark-transparent.png"
                    alt="AI"
                    className="mt-0.5 size-7 shrink-0 object-contain p-1 rounded-full bg-primary/5 dark:invert dark:brightness-125 shadow-sm ring-1 ring-border/50"
                  />
                )}

                {/* Message Content */}
                <div
                  className={cn(
                    'flex flex-col min-w-0',
                    message.role === 'user' ? 'items-end max-w-[90%]' : 'items-start max-w-full flex-1'
                  )}
                >
                  {isEditing ? (
                    <MessageEditor
                      messageId={message.id}
                      initialContent={content}
                      setMode={(mode) => {
                        if (mode === 'view') setEditingMessageId(null);
                      }}
                      onSave={handleEditSave}
                    />
                  ) : (
                    <>
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-3 text-sm leading-relaxed overflow-hidden',
                          message.role === 'user'
                            ? 'bg-primary/95 text-primary-foreground shadow-sm rounded-br-sm'
                            : 'bg-transparent'
                        )}
                      >
                        {message.role === 'user' ? (
                          <div className="whitespace-pre-wrap">{content}</div>
                        ) : (() => {
                          const rawSources = getMessageSources(message);
                          const allSources = [...(notes9Sources ?? []), ...rawSources];
                          let effectiveManifest = (notes9Parsed?.citationsManifest as any) ?? null;
                          if (!effectiveManifest && allSources.length > 0) {
                            effectiveManifest = {
                              manifest: allSources.reduce<Record<string, CitationsManifestEntry>>((acc, src, i) => {
                                const label = String(i + 1);
                                // Handle both GroundingResource (from notes9Sources) and data-source parts (from rawSources)
                                const anySrc = src as any;
                                const sourceName = anySrc.source_name || anySrc.title || anySrc.url || 'Source ' + label;
                                const sourceUrl = anySrc.source_url || (typeof anySrc.url === 'string' ? anySrc.url : undefined);
                                const excerpt = anySrc.excerpt || (typeof anySrc.snippet === 'string' ? anySrc.snippet : undefined);
                                acc[label] = {
                                  source_name: String(sourceName),
                                  source_url: sourceUrl,
                                  excerpt: excerpt,
                                  source_type: 'web',
                                } as CitationsManifestEntry;
                                return acc;
                              }, {} as Record<string, CitationsManifestEntry>)
                            };
                          }

                          const sourceToGroundingResource = (src: Record<string, unknown> | GroundingResource): GroundingResource => {
                            const anySrc = src as any;
                            const url = anySrc.source_url || (typeof anySrc.url === 'string' ? anySrc.url : undefined);
                            const rawTitle = anySrc.source_name || anySrc.title;
                            const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : url || 'Source';
                            return {
                              source_type: anySrc.source_type || 'web',
                              source_name: String(title),
                              source_url: url,
                              excerpt: anySrc.excerpt || (typeof anySrc.snippet === 'string' ? anySrc.snippet : undefined),
                            };
                          };
                          return (
                            <>
                              <MarkdownRenderer
                                content={assistantDisplayMarkdown}
                                citationsManifest={effectiveManifest}
                              />
                              {notes9Sources && (
                                <AgentCitationsPanel
                                  items={notes9Sources.map((c, i) =>
                                    groundingResourceToPanelItem(c, i)
                                  )}
                                  triggerLabel="All citations"
                                  className="mt-2"
                                />
                              )}
                              {!notes9Sources && rawSources.length > 0 && (
                                <AgentCitationsPanel
                                  items={rawSources.map((src, i) =>
                                    groundingResourceToPanelItem(sourceToGroundingResource(src), i)
                                  )}
                                  triggerLabel="All citations"
                                  className="mt-2"
                                />
                              )}
                              {/* Persisted relationship graphs — native dagre render */}
                              {messageGraphs.length > 0 && (
                                <div className="mt-3">
                                  <AgentGraphList graphs={messageGraphs} />
                                </div>
                              )}
                              {/* Persisted file/chart artifacts — re-sign their URLs lazily */}
                              {messageArtifacts.length > 0 && (
                                <div className="mt-3">
                                  <PersistedArtifactList artifacts={messageArtifacts} />
                                </div>
                              )}
                              {/* Blinking cursor at end of streaming text */}
                              {isLastAssistant && isLoading && (
                                <span
                                  className="inline-block w-[3px] h-[1em] bg-foreground/70 rounded-sm animate-cursor-blink ml-0.5 translate-y-[2px]"
                                  aria-hidden
                                />
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Message Actions */}
                      <MessageActions
                        sessionId={sessionId}
                        messageId={message.id}
                        messageRole={message.role as 'user' | 'assistant'}
                        messageContent={content}
                        vote={getVoteForMessage(message.id)}
                        userEditDisabled={isLastUserAwaitingReply}
                        regenerateDisabled={isLoading && isLastAssistant}
                        onEdit={
                          message.role === 'user' && onEditMessage
                            ? () => setEditingMessageId(message.id)
                            : undefined
                        }
                        onRegenerate={
                          isLastAssistant && onRegenerate ? onRegenerate : undefined
                        }
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Waiting for first token: show assistant avatar + blinking cursor */}
          {(isLoading || notes9Stream) && messages.at(-1)?.role === 'user' && (
            notes9Stream ? (
              <div className="flex w-full gap-3 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                <img
                  src="/notes9-logo-mark-transparent.png"
                  alt="AI Thinking"
                  className="size-8 shrink-0 -translate-y-[5px] object-contain p-1.5 rounded-full bg-primary/10 dark:invert dark:brightness-125 shadow-sm animate-spin"
                />
                <div className="flex-1 min-w-0 max-w-full space-y-2">
                  {/* When HITL is on (runId present) AgentStreamReply renders the
                      server-side cancel button; suppress this local-abort one to
                      avoid two stacked Stop buttons. Keep it when runId is absent. */}
                  {onStop && !notes9Stream.runId && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={onStop}
                      >
                        <Square className="size-2.5 fill-current" />
                        Stop
                      </Button>
                    </div>
                  )}
                  <AgentStreamReply
                    thinkingSteps={notes9Stream.thinkingSteps}
                    toolCards={notes9Stream.toolCards}
                    artifacts={notes9Stream.artifacts}
                    graphs={notes9Stream.graphs}
                    reasoning={notes9Stream.thinkingTokenBuffer}
                    sql={notes9Stream.sql}
                    ragChunks={notes9Stream.ragChunks}
                    streamedAnswer={notes9Stream.streamedAnswer}
                    donePayload={notes9Stream.donePayload}
                    citationsManifest={notes9Stream.citationsManifest}
                    error={notes9Stream.error}
                    isThinkingStreaming={notes9Stream.isStreaming}
                    liveCitationCount={notes9Stream.liveCitationCount}
                    runId={notes9Stream.runId}
                    onStop={notes9Stream.onStop}
                    onRetry={onRegenerate}
                  />
                </div>
              </div>
            ) : (
              <div className="flex w-full gap-3 justify-start animate-in fade-in slide-in-from-bottom-3 duration-300">
                <img
                  src="/notes9-logo-mark-transparent.png"
                  alt="AI Loading"
                  className="mt-0.5 size-7 shrink-0 object-contain p-1 rounded-full bg-primary/5 dark:invert dark:brightness-125 shadow-sm ring-1 ring-border/50 animate-spin duration-3000"
                />
                <div className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-muted/30 border border-border/30">
                  <span className="inline-block size-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} aria-hidden />
                  <span className="inline-block size-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} aria-hidden />
                  <span className="inline-block size-1.5 rounded-full bg-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} aria-hidden />
                  {onStop && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs ml-3"
                      onClick={onStop}
                    >
                      <Square className="size-2.5 fill-current" />
                      Stop
                    </Button>
                  )}
                </div>
              </div>
            )
          )}

          <div className="h-2 shrink-0" aria-hidden />
          </div>
        </div>
      </div>
      {showJumpBottom && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute bottom-3 right-3 z-10 h-9 w-9 rounded-full border border-border/60 bg-background/95 shadow-md backdrop-blur-sm hover:bg-muted"
          onClick={scrollToBottom}
          aria-label="Scroll to latest message"
        >
          <ChevronDown className="size-4" />
        </Button>
      )}
    </div>
  );
}
