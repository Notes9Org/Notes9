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
import { Send, Square, Sparkles, PanelLeftClose, PanelLeft, Globe, ChevronDown, Paperclip, Mic } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { ChatHistory } from './chat-history';
import { ChatMessage } from './chat-message';
import { PreviewAttachment, type Attachment } from './preview-attachment';
import { createClient } from '@/lib/supabase/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { extractToolCards } from '@/lib/chat-tool-parts';
import type { ToolCard } from '@/hooks/use-agent-stream';
import { usePinnedAutoScroll } from '@/hooks/use-pinned-auto-scroll';
import { recordRumEvent } from '@/lib/rum';
import { useAwsTranscribe } from '@/hooks/use-aws-transcribe';
import { VoiceWaveform } from '@/components/text-editor/voice-waveform';
import { toast } from 'sonner';

const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [messageAttachments, setMessageAttachments] = useState<Map<string, Attachment[]>>(new Map());

  const prevStatusRef = useRef<string>('ready');
  const webSearchEnabledRef = useRef(false);
  const currentSessionRef = useRef<string | null>(null);
  const hasLoadedSessionRef = useRef<string | null>(null);
  const supabaseTokenRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<string | null>(null);
  const submitInFlightRef = useRef(false);
  const pendingAttachmentsRef = useRef<Attachment[]>([]);
  const prevMessageCountRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabaseTokenRef.current = session?.access_token ?? null;
      prevUserIdRef.current = session?.user?.id ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextToken = session?.access_token ?? null;
      const nextUserId = session?.user?.id ?? null;
      const userChanged = prevUserIdRef.current !== null && nextUserId !== prevUserIdRef.current;
      const signedOut = nextUserId === null;
      if (signedOut || userChanged) {
        currentSessionRef.current = null;
        hasLoadedSessionRef.current = null;
      }
      supabaseTokenRef.current = nextToken;
      prevUserIdRef.current = nextUserId;
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

  // Assign pending attachments to the newest user message after each send
  useEffect(() => {
    if (pendingAttachmentsRef.current.length === 0) return;
    if (messages.length <= prevMessageCountRef.current) return;
    const newUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (newUserMsg) {
      setMessageAttachments((prev) => new Map(prev).set(newUserMsg.id, pendingAttachmentsRef.current));
      pendingAttachmentsRef.current = [];
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  const { start: startMic, stop: stopMic, isListening: micListening, getWaveformData } = useAwsTranscribe({
    onFinal: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text).trimStart()),
    onInterim: () => {},
    onError: (err) => toast.error(err),
  });

  const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
    if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} is too large (max 10MB)`); return null; }
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) { toast.error(`${file.name} type not supported`); return null; }
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Upload failed'); }
      const d = await res.json();
      return { url: d.url, name: d.pathname, contentType: d.contentType, size: d.size };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      return null;
    }
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadQueue(files.map((f) => f.name));
    const results = await Promise.all(files.map(uploadFile));
    setAttachments((prev) => [...prev, ...results.filter((r): r is Attachment => r !== null)]);
    setUploadQueue([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadFile]);

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

      const hydratedAtts = new Map<string, Attachment[]>();
      for (const m of msgs) {
        const atts = (m.metadata as { attachments?: Attachment[] } | undefined)?.attachments;
        if (Array.isArray(atts) && atts.length > 0) hydratedAtts.set(m.id, atts);
      }
      setMessageAttachments(hydratedAtts);
    } else {
      setMessages([]);
      setSavedMessageIds(new Set());
      setMessageAttachments(new Map());
    }
    hasLoadedSessionRef.current = sessionId;
    currentSessionRef.current = sessionId;
  }, [loadMessages, setMessages]);

  // Smart auto-scroll — only follows when the user is pinned to the bottom.
  // Scrolling up releases the pin so the user can read prior context while
  // streaming; the floating "↓" button re-pins on click.
  const {
    onScroll: onMessagesScroll,
    scrollToBottom: scrollMessagesToBottom,
    repin: repinMessages,
    showJumpBottom,
  } = usePinnedAutoScroll(scrollViewportRef, [messages, isLoading]);

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

            // Build metadata bundle: thinking, sources, attachments
            const metadata: Record<string, unknown> = {};
            const sources = getMessageSources(message);
            const thinking = getMessageThinking(message);
            if (sources.length > 0) metadata.sources = sources;
            if (thinking) metadata.thinking = thinking;
            if (message.role === 'user') {
              const atts = messageAttachments.get(message.id);
              if (atts && atts.length > 0) metadata.attachments = atts;
            }

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
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;

    const messageText = input;
    setInput('');

    try {
      if (typeof window !== 'undefined' && !window.sessionStorage.getItem('n9_first_chat_sent')) {
        recordRumEvent('user_first_chat', {});
        window.sessionStorage.setItem('n9_first_chat_sent', '1');
      }
    } catch {}

    // Sending a new message is an explicit "I want to see what comes next"
    // signal — re-pin so the user's own message + the streamed reply scroll
    // into view even if they were previously reading earlier history.
    repinMessages();

    try {
      let sessionId = currentSessionRef.current;
      if (!sessionId) {
        sessionId = await createSession();
        if (!sessionId) return;
        currentSessionRef.current = sessionId;
        hasLoadedSessionRef.current = sessionId;
      }

      // Capture attachments before clearing state
      const currentAttachments = [...attachments];
      if (currentAttachments.length > 0) {
        pendingAttachmentsRef.current = currentAttachments;
        setAttachments([]);
      }

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
    // ESC is owned by Radix `<Dialog onEscapeKeyDown>`. Don't double-fire it
    // from the textarea — used to close the modal mid-typing and destroy
    // the draft. The dialog still closes on ESC when focus is outside.
  };

  // Example prompts mirror what the full-page `<CatalystGreeting>` exposes so
  // first-time users of the modal see actionable starting points instead of a
  // blank textarea. Clicking sends the prompt immediately.
  const EXAMPLE_PROMPTS: { label: string; prompt: string }[] = [
    {
      label: 'Summarize my last experiment',
      prompt: 'Summarize my most recent experiment and its outcome.',
    },
    {
      label: 'Draft a protocol',
      prompt: 'Help me draft a protocol for transformation of E. coli with a plasmid.',
    },
    {
      label: 'Explain a calculation',
      prompt: 'Walk me through how to calculate molarity from mass and volume.',
    },
    {
      label: 'Find related notes',
      prompt: 'Find lab notes and protocols related to my current project.',
    },
  ];

  const sendExamplePrompt = async (text: string) => {
    if (isLoading || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    try {
      let sessionId = currentSessionRef.current;
      if (!sessionId) {
        sessionId = await createSession();
        if (!sessionId) return;
        currentSessionRef.current = sessionId;
        hasLoadedSessionRef.current = sessionId;
      }
      await sendMessage({ text });
    } finally {
      submitInFlightRef.current = false;
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

  // Reduce the message's `data-tool` parts back into ordered ToolCard[].
  // Forwarded by `/api/chat/route.ts` from upstream SSE tool_start /
  // tool_call / tool_result / tool_output events. Same shape the full-page
  // surface consumes — keeps the UI consistent across modal and page.
  const getMessageToolCards = (message: typeof messages[0]): ToolCard[] =>
    extractToolCards(message.parts);

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-[900px] h-[85vh] flex flex-col p-0 gap-0"
          onEscapeKeyDown={() => onOpenChange(false)}
        >
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
                aria-label={showHistory ? "Hide chat history" : "Show chat history"}
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
              <div
                ref={scrollViewportRef}
                onScroll={onMessagesScroll}
                className="relative flex-1 overflow-y-auto"
              >
                <div className="flex flex-col gap-4 p-6">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center min-h-[40vh] py-10 text-center">
                        <Sparkles className="size-10 text-primary/70 mb-3" />
                        <h3 className="font-display text-2xl md:text-3xl font-medium tracking-tight text-foreground">
                          How can I help you today?
                        </h3>
                        <p className="text-sm text-muted-foreground mt-2 max-w-md">
                          Ask Catalyst about experiments, protocols, chemistry
                          calculations, or anything in your workspace.
                        </p>
                        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                          {EXAMPLE_PROMPTS.map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => sendExamplePrompt(p.prompt)}
                              className={cn(
                                'rounded-lg border border-border/70 bg-background',
                                'px-3 py-2.5 text-left text-sm text-foreground/90',
                                'transition-colors hover:border-primary/40 hover:bg-primary/[0.04]',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                              )}
                              aria-label={`Send example prompt: ${p.label}`}
                            >
                              <div className="font-medium">{p.label}</div>
                              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {p.prompt}
                              </div>
                            </button>
                          ))}
                        </div>
                        <p className="mt-5 text-xs text-muted-foreground/70">
                          Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs">Esc</kbd> to close ·{' '}
                          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs">⇧ Enter</kbd> for new line
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
                            attachments={messageAttachments.get(message.id)}
                            sources={getMessageSources(message)}
                            thinking={getMessageThinking(message)}
                            toolCards={getMessageToolCards(message)}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="rounded-lg px-4 py-2.5 text-sm bg-destructive/10 text-destructive border border-destructive/20">
                            Something went wrong. Please try again.
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleRegenerate}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            Retry
                          </Button>
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
                            className="inline-block h-4 w-1 bg-foreground/70 rounded-sm animate-cursor-blink translate-y-[1px]"
                            aria-hidden
                          />
                        </div>
                      </div>
                    )}
                  </div>
              </div>

              {/* Floating jump-to-bottom — appears only when the user has
                  scrolled away from the latest message. Re-pins on click. */}
              {showJumpBottom && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute bottom-[88px] right-4 z-10 size-9 rounded-full border border-border/60 bg-background/95 shadow-md backdrop-blur-sm hover:bg-muted"
                  onClick={scrollMessagesToBottom}
                  aria-label="Scroll to latest message"
                >
                  <ChevronDown className="size-4" />
                </Button>
              )}

              {/* Input Area */}
              <div className="border-t p-4 shrink-0 space-y-2">
                {/* Web search + status row */}
                <div className="flex items-center justify-between px-0.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {isLoading && webSearchEnabled && (
                      <span className="flex items-center gap-1.5 animate-pulse">
                        <Globe className="size-3 shrink-0" /><span>Searching…</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs transition-colors", webSearchEnabled ? "text-primary font-medium" : "text-muted-foreground")}>
                      Web Search
                    </span>
                    <Globe className={cn("size-3.5 shrink-0 transition-colors", webSearchEnabled ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <Switch checked={webSearchEnabled} onCheckedChange={setWebSearchEnabled} disabled={isLoading} aria-label="Toggle web search" className="transition-transform active:scale-95" />
                  </div>
                </div>

                {/* Attachment previews */}
                {(attachments.length > 0 || uploadQueue.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((att, i) => (
                      <PreviewAttachment key={att.url} attachment={att} compact onRemove={() => setAttachments((p) => p.filter((_, idx) => idx !== i))} />
                    ))}
                    {uploadQueue.map((name) => (
                      <PreviewAttachment key={name} attachment={{ url: '', name, contentType: '' }} compact isUploading />
                    ))}
                  </div>
                )}

                {/* Composer */}
                <div className="relative rounded-xl border border-border bg-background focus-within:border-primary/50 focus-within:shadow-sm transition-all">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your data…"
                    className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-3 pt-3 pb-11 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isLoading}
                  />
                  {/* Hidden file input */}
                  <input ref={fileInputRef} type="file" multiple accept={ALLOWED_ATTACHMENT_TYPES.join(',')} className="hidden" onChange={handleFileSelect} disabled={isLoading || uploadQueue.length > 0} />

                  {/* Bottom toolbar */}
                  <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={() => fileInputRef.current?.click()} disabled={isLoading || uploadQueue.length > 0} aria-label="Attach file">
                        <Paperclip className="size-3.5" />
                      </Button>
                      <div className="inline-flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className={cn("size-7 text-muted-foreground hover:text-foreground", micListening && "text-red-500 hover:text-red-600")} onClick={() => micListening ? stopMic() : startMic()} disabled={isLoading} aria-label={micListening ? "Stop dictation" : "Dictate"}>
                          <Mic className="size-3.5" />
                        </Button>
                        {micListening && <VoiceWaveform getWaveformData={getWaveformData} />}
                      </div>
                    </div>
                    <div>
                      {isLoading ? (
                        <Button type="button" size="icon" variant="outline" className="size-7 rounded-full" onClick={stop} aria-label="Stop">
                          <Square className="size-3" />
                        </Button>
                      ) : (
                        <Button type="button" size="icon" className="size-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40" disabled={!input.trim() && attachments.length === 0} onClick={(e) => onSubmit(e)} aria-label="Send">
                          <Send className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
