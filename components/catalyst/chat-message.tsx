'use client';

import { useState, useDeferredValue } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, Check, RefreshCw, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';

interface SourceItem {
  url?: string;
  title?: string;
  snippet?: string;
  [key: string]: unknown;
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<Record<string, unknown>>;
  thinking?: string | null;
  userAvatar?: string | null;
  userName?: string;
  isLast?: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  isStreaming?: boolean;
}

export function ChatMessage({
  role,
  content,
  sources = [],
  thinking = null,
  userAvatar,
  userName,
  isLast,
  onRegenerate,
  isRegenerating,
  isStreaming = false,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const deferredContent = useDeferredValue(content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const isUser = role === 'user';
  const normalizedSources: SourceItem[] = (sources || [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => s as SourceItem);

  return (
    <div className={cn('group flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {/* Assistant Avatar */}
      {!isUser && (
        <Avatar className="size-8 shrink-0 mt-0.5">
          <AvatarImage
            src="/notes9-logo-mark-transparent.png"
            alt=""
            className="object-contain p-1.5 dark:invert dark:brightness-125"
          />
          <AvatarFallback className="bg-primary/10 text-primary">
            <span className="notes9-mascot-mask size-[18px]" aria-hidden />
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex flex-col gap-1.5 max-w-[85%]">
        {/* Thinking panel — collapsible */}
        {!isUser && thinking && (
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
            onClick={() => setShowThinking((v) => !v)}
            aria-expanded={showThinking}
          >
            <span className="inline-block size-1.5 rounded-full bg-primary/60 animate-pulse" />
            <span>Reasoning</span>
            {showThinking ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        )}
        {showThinking && thinking && (
          <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
            {thinking}
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={cn(
            'rounded-lg px-4 py-2.5 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted overflow-hidden',
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words overflow-wrap-anywhere">{content}</div>
          ) : (
            <MarkdownRenderer
              content={deferredContent}
              showCursor={isStreaming}
            />
          )}
        </div>

        {/* Sources */}
        {!isUser && normalizedSources.length > 0 && !isStreaming && (
          <div className="flex flex-col gap-1 mt-0.5">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <Globe className="size-3" /> Sources
            </span>
            <div className="flex flex-wrap gap-1.5">
              {normalizedSources.slice(0, 6).map((src, i) => {
                const url = typeof src.url === 'string' ? src.url : undefined;
                const title = typeof src.title === 'string' ? src.title : url ?? `Source ${i + 1}`;
                let domain = '';
                try {
                  if (url) domain = new URL(url).hostname.replace(/^www\./, '');
                } catch {
                  domain = '';
                }
                return url ? (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-colors max-w-[180px]"
                    title={title}
                  >
                    <Globe className="size-2.5 shrink-0" />
                    <span className="truncate">{domain || title}</span>
                  </a>
                ) : (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground max-w-[180px]"
                  >
                    <span className="truncate">{title}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions (visible on hover for completed assistant messages) */}
        {!isUser && content && !isStreaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" onClick={handleCopy}>
                  {copied ? (
                    <Check className="size-3.5 text-green-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{copied ? 'Copied!' : 'Copy message'}</TooltipContent>
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
                    <RefreshCw className={cn('size-3.5', isRegenerating && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Regenerate response</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <Avatar className="size-8 shrink-0 mt-0.5">
          {userAvatar && <AvatarImage src={userAvatar} alt={userName || 'User'} />}
          <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
            {userName ? userName.charAt(0).toUpperCase() : 'U'}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
