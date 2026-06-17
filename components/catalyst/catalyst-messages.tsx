'use client';

import { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UIMessage } from 'ai';
import { Sparkles, Square } from 'lucide-react';
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
import type { PersistedArtifact } from '@/lib/agent-artifacts';
import { parseNotes9AssistantStoredContent } from '@/lib/notes9-chat-format';
import type { Vote } from '@/lib/db/schema';
import type { ThinkingPayload, RagChunksPayload, DonePayload } from '@/lib/agent-stream-types';
import type { CitationsManifest, ToolCard, AgentArtifact } from '@/hooks/use-agent-stream';

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
        <div className="mx-auto max-w-3xl px-4 pt-6 pb-4">
          <div className="flex flex-col gap-4">
          {messages.map((message, index) => {
            const isEditing = editingMessageId === message.id;
            const content = getMessageContent(message);
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
                  'group/message flex w-full gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {/* Assistant Avatar */}
                {message.role === 'assistant' && (
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Sparkles className="size-3.5" />
                  </div>
                )}

                {/* Message Content */}
                <div
                  className={cn(
                    'flex flex-col',
                    message.role === 'user' ? 'items-end' : 'items-start',
                    message.role === 'user' ? 'max-w-[80%]' : 'max-w-full flex-1'
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
                          'rounded-2xl px-4 py-2.5 text-sm leading-[1.45]',
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-transparent'
                        )}
                      >
                        {message.role === 'user' ? (
                          <div className="whitespace-pre-wrap">{content}</div>
                        ) : (
                          <>
                            <MarkdownRenderer
                              content={assistantDisplayMarkdown}
                              citationsManifest={notes9Parsed?.citationsManifest ?? null}
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
                        )}
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
              <div className="flex w-full gap-3 justify-start">
                <div className="flex size-8 shrink-0 -translate-y-[5px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="size-4 animate-pulse" />
                </div>
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
                  />
                </div>
              </div>
            ) : (
              <div className="flex w-full gap-3 justify-start">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="size-3.5" />
                </div>
                <div className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm bg-transparent">
                  <span
                    className="inline-block w-[3px] h-[1em] bg-foreground/70 rounded-sm animate-cursor-blink translate-y-[1px]"
                    aria-hidden
                  />
                  {onStop && (
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
