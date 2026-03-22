'use client';

import { Plus, MessageSquare, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { ChatSession } from '@/hooks/use-chat-sessions';

interface CatalystSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  loading?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  hasMessages?: boolean;
}

export function CatalystSidebar({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  loading,
  isOpen,
  onToggle,
  hasMessages = false,
}: CatalystSidebarProps) {
  if (!isOpen) return null;

  return (
    <div className="flex h-full w-72 shrink-0 flex-col bg-muted/20">
      {/* Search Header Area - Only visible when NO messages */}
      {!hasMessages && (
        <div className="flex flex-col items-center justify-center py-8 border-b border-border/50">
          <div className="relative mb-3">
            <div className="absolute inset-x-[12%] inset-y-[16%] rounded-[2.25rem] bg-black/32 blur-3xl dark:bg-black/40" />
            <img
              src="/notes9-loading-transparent.apng"
              alt="Catalyst AI mascot"
              className="relative z-10 h-auto w-[112px] object-contain [filter:sepia(0.2)_saturate(0.78)_hue-rotate(-8deg)_brightness(0.5)_contrast(1.48)] dark:[filter:none]"
            />
          </div>
          <span className="text-sm font-semibold bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-transparent">
            Catalyst AI
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="font-semibold text-sm">Chat History</h2>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={onNewChat}
            title="New chat"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={onToggle}
            title="Close sidebar"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 pb-4">
          {loading ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              <MessageSquare className="mx-auto mb-2 size-8 opacity-30" />
              <p className="font-medium">No conversations yet</p>
              <p className="mt-1 text-xs opacity-70">Start a new chat to begin</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'group flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-all',
                  currentSessionId === session.id
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                onClick={() => onSelectSession(session.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectSession(session.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <MessageSquare className="mt-0.5 size-4 shrink-0 opacity-50" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {session.title || 'New conversation'}
                  </p>
                  <p className="text-xs opacity-60">
                    {formatDistanceToNow(new Date(session.updated_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
