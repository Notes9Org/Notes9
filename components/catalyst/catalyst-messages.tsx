'use client';

import { useEffect, useRef } from 'react';
import type { UIMessage } from 'ai';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';

interface CatalystMessagesProps {
  messages: UIMessage[];
  getMessageContent: (message: UIMessage) => string;
  isLoading: boolean;
}

export function CatalystMessages({
  messages,
  getMessageContent,
  isLoading,
}: CatalystMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-col gap-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'group flex w-full gap-3',
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
                  'rounded-2xl px-4 py-3 text-sm',
                  message.role === 'user'
                    ? 'max-w-[80%] bg-primary text-primary-foreground'
                    : 'max-w-full bg-transparent'
                )}
              >
                {message.role === 'user' ? (
                  <div className="whitespace-pre-wrap">
                    {getMessageContent(message)}
                  </div>
                ) : (
                  <MarkdownRenderer content={getMessageContent(message)} />
                )}
              </div>
            </div>
          ))}

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

