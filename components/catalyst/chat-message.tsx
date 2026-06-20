'use client';

import { useState, useDeferredValue } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, Check, RefreshCw, ChevronDown, ChevronUp, FileText, FileImage, FileCode, FileArchive, FileAudio, FileVideo, FileSpreadsheet, File } from 'lucide-react';
import type { Attachment } from './preview-attachment';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';
import { AgentToolCards } from './agent-tool-cards';
import {
  AgentCitationsPanel,
  groundingResourceToPanelItem,
} from './agent-citations-panel';
import type { ToolCard, CitationsManifest, CitationsManifestEntry } from '@/hooks/use-agent-stream';
import type { GroundingResource } from '@/lib/agent-stream-types';

interface SourceItem {
  url?: string;
  title?: string;
  snippet?: string;
  [key: string]: unknown;
}

/** Adapt the modal's loose web-source shape into a GroundingResource so the
 * same AgentCitationsPanel renders modal answers identically to the page. */
function sourceToGroundingResource(src: SourceItem | GroundingResource): GroundingResource {
  const anySrc = src as any;
  const url = anySrc.source_url || (typeof anySrc.url === 'string' ? anySrc.url : null);
  const rawTitle = anySrc.source_name || anySrc.title;
  const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : url || 'Source';
  const excerpt = anySrc.excerpt || (typeof anySrc.snippet === 'string' ? anySrc.snippet : null);
  return {
    source_type: anySrc.source_type || 'web',
    source_name: title,
    display_label: title,
    source_url: url,
    excerpt,
    match_kind: 'web',
  };
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
  sources?: Array<Record<string, unknown>>;
  thinking?: string | null;
  toolCards?: ToolCard[];
  userAvatar?: string | null;
  userName?: string;
  isLast?: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  isStreaming?: boolean;
  /** When present, inline `[N]` markers render as interactive citation chips. */
  citationsManifest?: CitationsManifest | null;
}

export function ChatMessage({
  role,
  content,
  attachments = [],
  sources = [],
  thinking = null,
  toolCards = [],
  userAvatar,
  userName,
  isLast,
  onRegenerate,
  isRegenerating,
  isStreaming = false,
  citationsManifest = null,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const deferredContent = useDeferredValue(content);

  const getAttachmentIcon = (att: Attachment) => {
    const type = att.contentType?.toLowerCase() || '';
    const name = att.name?.toLowerCase() || '';
    if (type.startsWith('image/')) return FileImage;
    if (type.startsWith('video/')) return FileVideo;
    if (type.startsWith('audio/')) return FileAudio;
    if (type.includes('pdf') || name.endsWith('.pdf')) return FileText;
    if (type.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return FileText;
    if (type.includes('excel') || type.includes('spreadsheet') || type.includes('csv') || name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return FileSpreadsheet;
    if (type.includes('zip') || type.includes('tar') || type.includes('rar') || name.endsWith('.zip') || name.endsWith('.tar.gz')) return FileArchive;
    if (type.includes('javascript') || type.includes('json') || type.includes('html') || type.includes('css') || name.match(/\.(js|ts|jsx|tsx|json|html|css|py|java|cpp|c|go|rs)$/)) return FileCode;
    return File;
  };

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
    <div
      className={cn(
        'group flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      {/* Assistant Avatar */}
      {!isUser && (
        <Avatar className="size-8 shrink-0 mt-0.5 shadow-sm ring-1 ring-border/50">
          <AvatarImage
            src="/notes9-logo-mark-transparent.png"
            alt=""
            className="object-contain p-1.5 dark:invert dark:brightness-125 bg-primary/5"
          />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            N9
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn('flex flex-col gap-1.5 min-w-0', isUser ? 'max-w-[85%]' : 'max-w-full flex-1 w-full')}>
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

        {/* Tool calls — Cursor/Claude-style inline transcript. While running,
            every card is visible (collapsible=false) so the user can see what
            the agent is doing right now. Once settled, the stack collapses
            behind a single "Used N tools" affordance to keep the bubble tight. */}
        {!isUser && toolCards.length > 0 && (
          <AgentToolCards
            cards={toolCards}
            collapsible={!isStreaming}
            className="mt-0.5"
          />
        )}

        {/* Attachments — shown above the bubble for user messages */}
        {isUser && attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end mb-1">
            {attachments.map((att, i) => {
              const isImage = att.contentType?.startsWith('image/');
              const Icon = getAttachmentIcon(att);
              return isImage ? (
                <a
                  key={i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl overflow-hidden border border-primary/20 shadow-sm hover:opacity-90 transition-opacity"
                  title={att.name}
                >
                  <img
                    src={att.url}
                    alt={att.name}
                    className="max-h-48 max-w-xs object-cover rounded-xl"
                  />
                </a>
              ) : (
                <a
                  key={i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 transition-colors max-w-[180px]"
                  title={att.name}
                >
                  <Icon className="size-3 shrink-0" />
                  <span className="truncate">{att.name}</span>
                </a>
              );
            })}
          </div>
        )}

        {/* Message Bubble — suppressed when the assistant has only tool cards
            and no answer text yet (avoids an empty grey block while tools run). */}
        {(isUser || content || !isStreaming) && (() => {
          let effectiveManifest = citationsManifest;
          if (!effectiveManifest && normalizedSources.length > 0) {
            effectiveManifest = {
              manifest: normalizedSources.reduce<Record<string, CitationsManifestEntry>>((acc, src, i) => {
                const label = String(i + 1);
                const anySrc = src as any;
                const sourceName = anySrc.source_name || anySrc.title || anySrc.url || 'Source ' + label;
                const sourceUrl = anySrc.source_url || (typeof anySrc.url === 'string' ? anySrc.url : undefined);
                const excerpt = anySrc.excerpt || (typeof anySrc.snippet === 'string' ? anySrc.snippet : undefined);
                // Honor the real source type/id when the stored source carries
                // them (workspace records, papers) so inline chips route and
                // badge correctly. Fall back to 'web' only when truly absent.
                const sourceType =
                  typeof anySrc.source_type === 'string' && anySrc.source_type.trim()
                    ? anySrc.source_type
                    : 'web';
                const sourceId =
                  typeof anySrc.source_id === 'string' && anySrc.source_id.trim()
                    ? anySrc.source_id
                    : undefined;
                acc[label] = {
                  source_name: String(sourceName),
                  source_url: sourceUrl,
                  excerpt: excerpt,
                  source_type: sourceType,
                  source_id: sourceId,
                } as CitationsManifestEntry;
                return acc;
              }, {} as Record<string, CitationsManifestEntry>)
            };
          }
          return (
            <div
              className={cn(
                'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                isUser
                  ? 'bg-primary/95 text-primary-foreground shadow-sm rounded-br-sm'
                  : 'bg-muted/40 text-foreground overflow-hidden rounded-bl-sm border border-border/40 shadow-sm',
              )}
            >
              {isUser ? (
                <div className="whitespace-pre-wrap break-words overflow-wrap-anywhere">{content}</div>
              ) : (
                <MarkdownRenderer
                  content={deferredContent}
                  showCursor={isStreaming}
                  citationsManifest={effectiveManifest}
                />
              )}
            </div>
          );
        })()}

        {/* Sources — routed through the shared AgentCitationsPanel so modal
            answers get the same grouped, interactive citation display as the
            page surface. */}
        {!isUser && normalizedSources.length > 0 && !isStreaming && (
          <AgentCitationsPanel
            items={normalizedSources.map((src, i) =>
              groundingResourceToPanelItem(sourceToGroundingResource(src), i)
            )}
            triggerLabel="All citations"
            className="mt-0.5 self-start"
          />
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
