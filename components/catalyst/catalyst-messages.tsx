'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UIMessage } from 'ai';
import { Sparkles, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from './markdown-renderer';
import { MessageActions } from './message-actions';
import { MessageEditor } from './message-editor';
import { AgentStreamReply } from './agent-stream-reply';
import type { Vote } from '@/lib/db/schema';
import type { ThinkingPayload, RagChunksPayload, DonePayload } from '@/lib/agent-stream-types';

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
    sql: string | null;
    ragChunks: RagChunksPayload | null;
    streamedAnswer: string;
    donePayload: DonePayload | null;
    error: string | null;
    isStreaming: boolean;
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
  const endRef = useRef<HTMLDivElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showJumpBottom, setShowJumpBottom] = useState(false);

  const updateJumpBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpBottom(dist > 120);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // Auto-scroll to bottom when messages or stream updates
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    const id = requestAnimationFrame(() => updateJumpBottom());
    return () => cancelAnimationFrame(id);
  }, [messages, notes9Stream, updateJumpBottom]);

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
        onScroll={updateJumpBottom}
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
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-white shadow-sm">
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
                          <MarkdownRenderer content={content} />
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

          {/* Thinking indicator or Notes9 agent stream */}
          {(isLoading || notes9Stream) && messages.at(-1)?.role === 'user' && (
            notes9Stream ? (
              <div className="flex w-full gap-3 justify-start">
                <div className="flex size-8 shrink-0 -translate-y-[5px] items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-white shadow-sm">
                  <Sparkles className="size-4 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0 max-w-full space-y-2">
                  {onStop && (
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
                    sql={notes9Stream.sql}
                    ragChunks={notes9Stream.ragChunks}
                    streamedAnswer={notes9Stream.streamedAnswer}
                    donePayload={notes9Stream.donePayload}
                    error={notes9Stream.error}
                    isThinkingStreaming={notes9Stream.isStreaming}
                  />
                </div>
              </div>
            ) : (
              <div className="flex w-full gap-3 justify-start">
                <div className="mt-0.5 flex size-7 shrink-0 -translate-y-[5px] items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-white shadow-sm">
                  <Sparkles className="size-3.5 animate-pulse" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                  <span className="flex items-center gap-1">
                    <span>Thinking</span>
                    <span className="inline-flex">
                      <span className="animate-bounce [animation-delay:0ms]">.</span>
                      <span className="animate-bounce [animation-delay:150ms]">.</span>
                      <span className="animate-bounce [animation-delay:300ms]">.</span>
                    </span>
                  </span>
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

          <div ref={endRef} className="h-2 shrink-0" aria-hidden />
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
