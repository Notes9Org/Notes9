'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, Check, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  userAvatar?: string | null;
  userName?: string;
  isLast?: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function ChatMessage({
  role,
  content,
  userAvatar,
  userName,
  isLast,
  onRegenerate,
  isRegenerating,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const isUser = role === 'user';

  return (
    <div
      className={cn(
        'group flex gap-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex flex-col gap-1 max-w-[85%]">
        {/* Message Bubble */}
        <div
          className={cn(
            'rounded-lg px-4 py-2.5 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>

        {/* Actions (visible on hover for assistant messages) */}
        {!isUser && content && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-3.5 text-green-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {copied ? 'Copied!' : 'Copy message'}
              </TooltipContent>
            </Tooltip>

            {isLast && onRegenerate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                  >
                    <RefreshCw
                      className={cn(
                        'size-3.5',
                        isRegenerating && 'animate-spin'
                      )}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Regenerate response
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <Avatar className="size-8 shrink-0">
          {userAvatar && <AvatarImage src={userAvatar} alt={userName || 'User'} />}
          <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
            {userName ? userName.charAt(0).toUpperCase() : 'U'}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

