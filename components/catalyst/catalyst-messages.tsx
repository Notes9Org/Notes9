'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { UIMessage } from 'ai';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';
import { MessageActions } from './message-actions';
import { MessageEditor } from './message-editor';
import type { Vote } from '@/lib/db/schema';

interface CatalystMessagesProps {
  messages: UIMessage[];
  getMessageContent: (message: UIMessage) => string;
  isLoading: boolean;
  sessionId: string | null;
  votes?: Vote[];
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate?: () => void;
}

export function CatalystMessages({
  messages,
  getMessageContent,
  isLoading,
  sessionId,
  votes = [],
  onEditMessage,
  onRegenerate,
}: CatalystMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-col gap-6">
          {messages.map((message, index) => {
            const isEditing = editingMessageId === message.id;
            const content = getMessageContent(message);
            const isLastAssistant =
              message.role === 'assistant' && index === messages.length - 1;

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
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-white shadow-sm">
                    <Sparkles className="size-4" />
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
                          'rounded-2xl px-4 py-3 text-sm',
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
                        isLoading={isLoading}
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

          {/* Thinking indicator */}
          {isLoading && messages.at(-1)?.role === 'user' && (
            <div className="flex w-full gap-3 justify-start">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-white shadow-sm">
                <Sparkles className="size-4 animate-pulse" />
              </div>
              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                <span>Thinking</span>
                <span className="inline-flex">
                  <span className="animate-bounce [animation-delay:0ms]">.</span>
                  <span className="animate-bounce [animation-delay:150ms]">.</span>
                  <span className="animate-bounce [animation-delay:300ms]">.</span>
                </span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}
