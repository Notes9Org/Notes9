'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Send, Square, Sparkles, PanelLeftClose, PanelLeft, Globe } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { ChatHistory } from './chat-history';
import { ChatMessage } from './chat-message';
import { createClient } from '@/lib/supabase/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CatalystChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserProfile {
  avatar_url: string | null;
  full_name: string | null;
}

export function CatalystChat({ open, onOpenChange }: CatalystChatProps) {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);


  const prevStatusRef = useRef<string>('ready');
  const webSearchEnabledRef = useRef(false);
  const currentSessionRef = useRef<string | null>(null);
  const hasLoadedSessionRef = useRef<string | null>(null);
  const supabaseTokenRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabaseTokenRef.current = session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      supabaseTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    webSearchEnabledRef.current = webSearchEnabled;
  }, [webSearchEnabled]);

  const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    loading: sessionsLoading,
    createSession,
    updateSessionTitle,
    deleteSession,
    loadMessages,
    saveMessage,
    loadSessions,
  } = useChatSessions();

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest(request) {
      const token = supabaseTokenRef.current;
      return {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: {
          messages: request.messages,
          sessionId: currentSessionRef.current,
          webSearch: webSearchEnabledRef.current,
          ...request.body,
        },
      };
    },
  }), []);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: 'catalyst-modal',
    transport,
  });

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = status === 'streaming' || status === 'submitted';

  // Load user profile (runs once)
  useEffect(() => {
    const loadUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('avatar_url, full_name')
          .eq('id', user.id)
          .single();
        if (data) {
          // avatar_url stores either a legacy public URL or (post-051) a
          // storage path inside the private `user` bucket — sign it for display.
          if (data.avatar_url) {
            const { createBucketSignedUrl, USER_STORAGE_BUCKET } = await import('@/lib/storage-signed-url');
            const signed = await createBucketSignedUrl(supabase, USER_STORAGE_BUCKET, data.avatar_url);
            setUserProfile({ ...data, avatar_url: signed });
          } else {
            setUserProfile(data);
          }
        }
      }
    };
    loadUserProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load messages when selecting a session from history.
  // Hydrate the AI SDK message shape with `parts` that include text + data parts
  // (sources, thinking) reconstructed from metadata so loaded sessions render
  // identically to live ones.
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    if (hasLoadedSessionRef.current === sessionId) return;

    const msgs = await loadMessages(sessionId);
    if (msgs.length > 0) {
      const chatMessages = msgs.map((m) => {
        const meta = (m.metadata || {}) as { sources?: unknown[]; thinking?: string };
        const parts: Array<Record<string, unknown>> = [
          { type: 'text', text: m.content },
        ];
        if (Array.isArray(meta.sources)) {
          for (const src of meta.sources) {
            if (src && typeof src === 'object') {
              parts.push({ type: 'data-source', data: { source: src } });
            }
          }
        }
        if (typeof meta.thinking === 'string' && meta.thinking.trim()) {
          parts.push({ type: 'data-thinking', data: { thinking: meta.thinking } });
        }
        return {
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          parts: parts as unknown as Array<{ type: 'text'; text: string }>,
          createdAt: new Date(m.created_at),
        };
      });
      setMessages(chatMessages);
      setSavedMessageIds(new Set(msgs.map((m) => m.id)));
    } else {
      setMessages([]);
      setSavedMessageIds(new Set());
    }
    hasLoadedSessionRef.current = sessionId;
    currentSessionRef.current = sessionId;
  }, [loadMessages, setMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const scrollContainer = scrollViewportRef.current;
    if (scrollContainer) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  }, [messages, isLoading]);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  // Save messages to database when streaming completes
  useEffect(() => {
    const saveNewMessages = async () => {
      const sessionId = currentSessionRef.current;

      // Only save when transitioning from streaming/submitted to ready
      if (prevStatusRef.current !== 'ready' && status === 'ready' && sessionId && messages.length > 0) {
        // Save all unsaved messages - FIX: Better content extraction
        const newSavedIds = new Set(savedMessageIds);

        for (const message of messages) {
          if (!newSavedIds.has(message.id)) {
            // Extract TEXT only — never include thinking, sources, or tool parts
            // in the persisted content. Those go in metadata so they can be
            // rendered separately (and never leak into the visible chat history).
            let content = '';
            if (message.parts && message.parts.length > 0) {
              content = message.parts
                .filter((p) => p.type === 'text')
                .map((p) => ('text' in p ? p.text : ''))
                .join('');
            } else if (typeof (message as unknown as { content?: unknown }).content === 'string') {
              content = (message as unknown as { content: string }).content;
            }

            // Build metadata bundle: thinking, sources, role provenance
            const metadata: Record<string, unknown> = {};
            const sources = getMessageSources(message);
            const thinking = getMessageThinking(message);
            if (sources.length > 0) metadata.sources = sources;
            if (thinking) metadata.thinking = thinking;

            if (content.trim()) {
              try {
                await saveMessage(
                  sessionId,
                  message.role as 'user' | 'assistant',
                  content.trim(),
                  Object.keys(metadata).length > 0 ? metadata : undefined,
                );
                newSavedIds.add(message.id);
              } catch (error) {
                console.error('Error saving message:', error);
                // Continue trying to save other messages
              }
            }
          }
        }

        setSavedMessageIds(newSavedIds);

        // Update title if this is the first exchange
        if (messages.length <= 2 && !sessions.find(s => s.id === sessionId)?.title) {
          const firstUserMessage = messages.find((m) => m.role === 'user');
          if (firstUserMessage) {
            let title = '';
            if (firstUserMessage.parts && firstUserMessage.parts.length > 0) {
              title = firstUserMessage.parts
                .filter((p) => p.type === 'text')
                .map((p) => ('text' in p ? p.text : ''))
                .join('')
                .slice(0, 50);
            } else if (typeof (firstUserMessage as unknown as { content?: unknown }).content === 'string') {
              title = (firstUserMessage as unknown as { content: string }).content.slice(0, 50);
            }

            if (title.trim()) {
              try {
                await updateSessionTitle(sessionId, title.trim());
                // Refresh sessions list to show updated title
                await loadSessions();
              } catch (error) {
                console.error('Error updating session title:', error);
              }
            }
          }
        }
      }
      prevStatusRef.current = status;
    };
    saveNewMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages.length]); // FIX: Also depend on messages.length to catch updates

  const handleNewChat = useCallback(async () => {
    // Clear current state
    setMessages([]);
    setSavedMessageIds(new Set());
    currentSessionRef.current = null;
    hasLoadedSessionRef.current = null;
    
    // Create new session
    const sessionId = await createSession();
    if (sessionId) {
      currentSessionRef.current = sessionId;
      hasLoadedSessionRef.current = sessionId; // Mark as "loaded" (empty is fine)
    }
  }, [createSession, setMessages]);

  const handleSelectSession = useCallback((sessionId: string) => {
    // Clear current messages
    setMessages([]);
    setSavedMessageIds(new Set());
    hasLoadedSessionRef.current = null; // Allow loading
    
    // Set the session and load messages
    setCurrentSessionId(sessionId);
    loadSessionMessages(sessionId);
  }, [setCurrentSessionId, setMessages, loadSessionMessages]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId);
    if (currentSessionRef.current === sessionId) {
      setMessages([]);
      setSavedMessageIds(new Set());
      currentSessionRef.current = null;
      hasLoadedSessionRef.current = null;
    }
  }, [deleteSession, setMessages]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;

    const messageText = input;
    setInput('');

    try {
      // Create session if none exists
      let sessionId = currentSessionRef.current;
      if (!sessionId) {
        sessionId = await createSession();
        if (!sessionId) return;
        currentSessionRef.current = sessionId;
        hasLoadedSessionRef.current = sessionId;
      }

      // Let AI SDK handle the message - it will be saved when streaming completes
      await sendMessage({ text: messageText });
    } finally {
      submitInFlightRef.current = false;
    }
  };

  const handleRegenerate = useCallback(async () => {
    if (messages.length < 2 || !currentSessionRef.current || isLoading) return;

    setIsRegenerating(true);

    // Find the LAST user message — assistant message we're regenerating may not
    // be the very last entry if errors/edits left state in flux.
    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }
    if (lastUserMessageIndex < 0) {
      setIsRegenerating(false);
      return;
    }
    const lastUserMessage = messages[lastUserMessageIndex];

    const userContent = lastUserMessage.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => ('text' in p ? p.text : ''))
      .join('') || '';

    if (!userContent.trim()) {
      setIsRegenerating(false);
      return;
    }

    // Drop the user message AND everything after it — then resend.
    // The user message will be re-added by `sendMessage`, and the assistant
    // response starts fresh. Also clear the assistant rows from the DB so
    // stale orphaned replies don't accumulate on retry.
    const messagesBeforeRetry = messages.slice(0, lastUserMessageIndex);
    setMessages(messagesBeforeRetry);

    // Strip saved-message tracking for anything we just removed so future
    // saves don't think they were already persisted.
    const removedIds = new Set(
      messages.slice(lastUserMessageIndex).map((m) => m.id)
    );
    setSavedMessageIds((prev) => {
      const next = new Set(prev);
      removedIds.forEach((id) => next.delete(id));
      return next;
    });

    try {
      await sendMessage({ text: userContent });
    } finally {
      setIsRegenerating(false);
    }
  }, [messages, setMessages, sendMessage, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
    if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Extract text content from message parts
  const getMessageContent = (message: typeof messages[0]): string => {
    if (message.parts && message.parts.length > 0) {
      return message.parts
        .filter((p) => p.type === 'text')
        .map((p) => ('text' in p ? p.text : ''))
        .join('');
    }
    return 'content' in message ? String((message as unknown as { content: unknown }).content) : '';
  };

  const getMessageSources = (message: typeof messages[0]): Array<Record<string, unknown>> => {
    if (!message.parts) return [];
    return message.parts
      .filter((p): p is { type: 'data-source'; data: { source: Record<string, unknown> } } =>
        (p as { type: string }).type === 'data-source'
      )
      .map((p) => (p as { type: string; data: { source: Record<string, unknown> } }).data?.source)
      .filter(Boolean) as Array<Record<string, unknown>>;
  };

  const getMessageThinking = (message: typeof messages[0]): string | null => {
    if (!message.parts) return null;
    const parts = message.parts
      .filter((p): p is { type: 'data-thinking'; data: { thinking: string } } =>
        (p as { type: string }).type === 'data-thinking'
      )
      .map((p) => (p as { type: string; data: { thinking: string } }).data?.thinking)
      .filter(Boolean);
    return parts.length > 0 ? parts.join('') : null;
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                Catalyst
              </DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeft className="size-4" />
                )}
              </Button>
            </div>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Chat History Sidebar */}
            {showHistory && (
              <div className="w-64 shrink-0">
                <ChatHistory
                  sessions={sessions}
                  currentSessionId={currentSessionId}
                  onSelectSession={handleSelectSession}
                  onNewChat={handleNewChat}
                  onDeleteSession={handleDeleteSession}
                  loading={sessionsLoading}
                />
              </div>
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Messages Area — plain div so the ref targets the real scroll container */}
              <div ref={scrollViewportRef} className="flex-1 overflow-y-auto">
                <div className="flex flex-col gap-4 p-6">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-[40vh] text-center">
                        <Sparkles className="size-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium text-muted-foreground">
                          How can I help you today?
                        </h3>
                        <p className="text-sm text-muted-foreground/70 mt-2 max-w-sm">
                          Ask me about experiments, protocols, chemistry calculations,
                          or scientific documentation.
                        </p>
                      </div>
                    ) : (
                      messages.map((message, index) => {
                        const isLastAssistant = index === messages.length - 1 && message.role === 'assistant';
                        const showStreamingStatus = isLastAssistant && isLoading;

                        return (
                          <ChatMessage
                            key={message.id}
                            role={message.role as 'user' | 'assistant'}
                            content={getMessageContent(message)}
                            sources={getMessageSources(message)}
                            thinking={getMessageThinking(message)}
                            userAvatar={userProfile?.avatar_url}
                            userName={userProfile?.full_name || undefined}
                            isLast={isLastAssistant}
                            onRegenerate={handleRegenerate}
                            isRegenerating={isRegenerating}
                            isStreaming={showStreamingStatus}
                          />
                        );
                      })
                    )}
                    {status === 'error' && (
                      <div className="flex gap-3 justify-start">
                        <Avatar className="size-8 shrink-0">
                          <AvatarFallback className="bg-destructive/10 text-destructive text-xs">!</AvatarFallback>
                        </Avatar>
                        <div className="rounded-lg px-4 py-2.5 text-sm bg-destructive/10 text-destructive border border-destructive/20">
                          Something went wrong. Please try again.
                        </div>
                      </div>
                    )}
                    {isLoading && messages[messages.length - 1]?.role === 'user' && (
                      <div className="flex gap-3 justify-start">
                        <Avatar className="size-8 shrink-0">
                          <AvatarImage
                            src="/notes9-logo-mark-transparent.png"
                            alt=""
                            className="object-contain p-1.5 dark:invert dark:brightness-125"
                          />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            <span className="notes9-mascot-mask size-[18px]" aria-hidden />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex items-center px-4 py-2.5 text-sm">
                          <span
                            className="inline-block w-[3px] h-[1em] bg-foreground/70 rounded-sm animate-cursor-blink translate-y-[1px]"
                            aria-hidden
                          />
                        </div>
                      </div>
                    )}
                  </div>
              </div>

              {/* Input Area */}
              <div className="border-t p-4 shrink-0 space-y-2">
                <div className="flex items-center justify-between px-0.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {isLoading && webSearchEnabled && (
                      <span className="flex items-center gap-1.5 animate-pulse">
                        <Globe className="size-3 shrink-0" />
                        <span>Searching the web...</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs transition-colors",
                      webSearchEnabled ? "text-primary font-medium" : "text-muted-foreground"
                    )}>
                      Web Search
                    </span>
                    <Globe className={cn(
                      "size-3.5 shrink-0 transition-colors",
                      webSearchEnabled ? "text-primary" : "text-muted-foreground"
                    )} aria-hidden />
                    <Switch
                      checked={webSearchEnabled}
                      onCheckedChange={setWebSearchEnabled}
                      disabled={isLoading}
                      aria-label="Toggle web search"
                      className="transition-transform active:scale-95"
                    />
                  </div>
                </div>
                <form onSubmit={onSubmit} className="flex gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Catalyst anything... (Enter to send, Shift+Enter for new line)"
                    className="min-h-[44px] max-h-[200px] resize-none"
                    disabled={isLoading}
                  />
                  {isLoading ? (
                    <Button type="button" size="icon" variant="outline" onClick={stop}>
                      <Square className="size-4" />
                    </Button>
                  ) : (
                    <Button type="submit" size="icon" disabled={!input.trim()}>
                      <Send className="size-4" />
                    </Button>
                  )}
                </form>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
