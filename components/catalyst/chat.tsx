'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Send, Square, Sparkles, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { ChatHistory } from './chat-history';
import { ChatMessage } from './chat-message';
import { createClient } from '@/lib/supabase/client';
import { TooltipProvider } from '@/components/ui/tooltip';

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

  const prevStatusRef = useRef<string>('ready');
  const currentSessionRef = useRef<string | null>(null);
  const hasLoadedSessionRef = useRef<string | null>(null);
  const supabaseTokenRef = useRef<string | null>(null);

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
          supabaseToken: token ?? undefined,
          ...request.body,
        },
      };
    },
  }), []);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: 'catalyst-modal',
    transport,
  });

  const scrollAreaRef = useRef<HTMLDivElement>(null);
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
          setUserProfile(data);
        }
      }
    };
    loadUserProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load messages when selecting a session from history
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    // Prevent loading the same session twice
    if (hasLoadedSessionRef.current === sessionId) return;
    
    const msgs = await loadMessages(sessionId);
    if (msgs.length > 0) {
      const chatMessages = msgs.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        parts: [{ type: 'text' as const, text: m.content }],
        createdAt: new Date(m.created_at),
      }));
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
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

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
        // Save all unsaved messages
        const newSavedIds = new Set(savedMessageIds);
        
        for (const message of messages) {
          if (!newSavedIds.has(message.id)) {
            const content = message.parts
              ?.filter((p) => p.type === 'text')
              .map((p) => ('text' in p ? p.text : ''))
              .join('') || '';
            
            if (content) {
              await saveMessage(sessionId, message.role as 'user' | 'assistant', content);
              newSavedIds.add(message.id);
            }
          }
        }
        
        setSavedMessageIds(newSavedIds);

        // Update title if this is the first exchange
        if (messages.length <= 2) {
          const firstUserMessage = messages.find((m) => m.role === 'user');
          if (firstUserMessage) {
            const title = firstUserMessage.parts
              ?.filter((p) => p.type === 'text')
              .map((p) => ('text' in p ? p.text : ''))
              .join('')
              .slice(0, 50) || 'New conversation';
            await updateSessionTitle(sessionId, title);
          }
        }
        
        // Refresh sessions list to show updated title
        loadSessions();
      }
      prevStatusRef.current = status;
    };
    saveNewMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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

    const messageText = input;
    setInput('');

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
  };

  const handleRegenerate = useCallback(async () => {
    if (messages.length < 2 || !currentSessionRef.current) return;
    
    setIsRegenerating(true);
    
    // Get the last user message
    const lastUserMessageIndex = messages.length - 2;
    const lastUserMessage = messages[lastUserMessageIndex];
    
    if (lastUserMessage?.role !== 'user') {
      setIsRegenerating(false);
      return;
    }

    const userContent = lastUserMessage.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => ('text' in p ? p.text : ''))
      .join('') || '';

    // Remove the last assistant message from UI
    setMessages(messages.slice(0, -1));
    
    // Regenerate
    await sendMessage({ text: userContent });
    setIsRegenerating(false);
  }, [messages, setMessages, sendMessage]);

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
    return 'content' in message ? String(message.content) : '';
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
              {/* Messages Area */}
              <ScrollArea className="flex-1 overflow-hidden">
                <div ref={scrollAreaRef} className="h-full overflow-y-auto">
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
                      messages.map((message, index) => (
                        <ChatMessage
                          key={message.id}
                          role={message.role as 'user' | 'assistant'}
                          content={getMessageContent(message)}
                          userAvatar={userProfile?.avatar_url}
                          userName={userProfile?.full_name || undefined}
                          isLast={index === messages.length - 1 && message.role === 'assistant'}
                          onRegenerate={handleRegenerate}
                          isRegenerating={isRegenerating}
                        />
                      ))
                    )}
                    {isLoading && messages[messages.length - 1]?.role === 'user' && (
                      <div className="flex gap-3 justify-start">
                        <div className="bg-muted rounded-lg px-4 py-2.5 max-w-[85%]">
                          <div className="flex gap-1">
                            <span
                              className="size-2 bg-foreground/50 rounded-full animate-bounce"
                              style={{ animationDelay: '0ms' }}
                            />
                            <span
                              className="size-2 bg-foreground/50 rounded-full animate-bounce"
                              style={{ animationDelay: '150ms' }}
                            />
                            <span
                              className="size-2 bg-foreground/50 rounded-full animate-bounce"
                              style={{ animationDelay: '300ms' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>

              {/* Input Area */}
              <div className="border-t p-4 shrink-0">
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
