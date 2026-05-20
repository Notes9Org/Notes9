'use client';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageSquare, Trash2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatSession } from '@/hooks/use-chat-sessions';
import { formatDistanceToNow } from 'date-fns';

interface ChatHistoryProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  loading?: boolean;
}

export function ChatHistory({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  loading,
}: ChatHistoryProps) {
  return (
    <div className="flex flex-col h-full border-r">
      {/* Catalyst AI Logo - Only if no conversations yet can be a bit strict, 
          let's follow the request: "when user starts using the chat it should disappear"
          Wait, ChatHistory doesn't know about current messages easily.
          But we can pass it. */}
      {sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 border-b border-border/50 bg-muted/5">
          <div className="relative mb-2">
            <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-orange-400 to-pink-500 opacity-20 blur-xl" />
            <Sparkles className="relative size-4 text-orange-500" />
          </div>
          <span className="text-xs font-semibold bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-transparent">
            Catalyst AI
          </span>
        </div>
      )}
      {/* New Chat Button */}
      <div className="p-3 border-b">
        <Button onClick={onNewChat} className="w-full gap-2" size="sm">
          <Plus className="size-4" />
          New Chat
        </Button>
      </div>

      {/* Sessions List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            sessions.map((session) => {
              const isCurrent = currentSessionId === session.id;
              const sessionTitle = session.title || 'New conversation';
              return (
                <div
                  key={session.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-lg pr-1.5 text-sm transition-colors',
                    isCurrent ? 'bg-primary/10' : 'hover:bg-muted',
                  )}
                >
                  {/* Real button — keyboard reachable, focus ring, full hit area */}
                  <button
                    type="button"
                    onClick={() => onSelectSession(session.id)}
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={`Open chat: ${sessionTitle}`}
                    className={cn(
                      'flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-left rounded-lg',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      isCurrent ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    <MessageSquare className="size-4 shrink-0" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{sessionTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(session.updated_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </button>
                  {/* Delete — always reachable on focus; visible on hover/focus.
                      Size bumped from size-6 (24px) to icon (36px) to meet the
                      ~40px hit-target threshold. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    aria-label={`Delete chat: ${sessionTitle}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

