'use client';

import { useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import {
  Sparkles,
  Square,
  ArrowUp,
  History,
  Maximize2,
  Minimize2,
  Plus,
  Paperclip,
  Globe,
  FlaskConical,
  PenBox,
  MoreHorizontal,
  Trash2,
  ChevronDown,
  ChevronLeft,
  X,
  Mic,
} from 'lucide-react';
import { cn, formatCitationDisplay } from '@/lib/utils';
import { useChatSessions, ChatSession } from '@/hooks/use-chat-sessions';
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer';
import { PreviewAttachment, type Attachment } from '@/components/catalyst/preview-attachment';
import { MessageActions } from '@/components/catalyst/message-actions';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AgentMode = 'general' | 'notes9';

/** Unwrap stringified JSON parts to plain text (handles double/triple wrapping). Used so request body always sends plain text. */
function normalizeMessageContentToPlainText(raw: string): string {
  let s = raw?.trim() ?? '';
  const maxUnwrap = 5;
  for (let i = 0; i < maxUnwrap; i++) {
    if (!s || !s.startsWith('[') || !s.includes('"type"') || !s.includes('"text"')) return s;
    try {
      const parsed = JSON.parse(s) as Array<{ type?: string; text?: string }>;
      if (!Array.isArray(parsed)) return s;
      const text = parsed
        .filter((p) => p?.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text!)
        .join('');
      if (text === s) return s;
      s = text;
    } catch {
      return s;
    }
  }
  return s;
}

/** Get plain text from a message object (content or parts) for sending in request body. */
function getPlainTextFromMessage(msg: { content?: unknown; parts?: Array<{ type?: string; text?: string }> }): string {
  if (msg.content != null && typeof msg.content === 'string') {
    return normalizeMessageContentToPlainText(msg.content);
  }
  if (msg.parts?.length) {
    const fromParts = msg.parts
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => normalizeMessageContentToPlainText(p.text!))
      .join('\n');
    if (fromParts) return fromParts;
  }
  return '';
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
];

export function RightSidebar() {
  const [input, setInput] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>('general');
  const [userId, setUserId] = useState<string>('');
  const [notes9Loading, setNotes9Loading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isDraggingContext, setIsDraggingContext] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedHistoryOpen, setExpandedHistoryOpen] = useState(true);
  const [showAllPastChats, setShowAllPastChats] = useState(false);

  // Cursor-like UI States
  // If messages.length === 0 => "New Chat View" (Input at top/center, Past Chats at bottom)
  // If messages.length > 0 => "Active Chat View" (Messages take space, Input at bottom)

  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const loadUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    loadUserId();
  }, [supabase]);

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest(request) {
      // Normalize messages to plain text so request body never re-sends stringified JSON (stops double-wrap)
      const normalizedMessages = request.messages.map((msg: { role: string; content?: unknown; parts?: Array<{ type?: string; text?: string }> }) => {
        const plainText = getPlainTextFromMessage(msg);
        return { role: msg.role, content: plainText };
      });
      return {
        body: {
          messages: normalizedMessages,
          sessionId: currentSessionRef.current,
          ...request.body,
        },
      };
    },
  }), []);

  const { messages, sendMessage, status, stop, setMessages, regenerate } = useChat({
    id: 'sidebar-chat',
    transport,
    experimental_throttle: 100,
  });

  const {
    sessions,
    createSession,
    loadMessages,
    loadSessions,
    saveMessage,
    currentSessionId,
    setCurrentSessionId,
    updateSessionTitle,
    deleteSession,
  } = useChatSessions();

  const MAX_PAST_CHATS = 5;
  const pastChatsToShow = showAllPastChats ? sessions : sessions.slice(0, MAX_PAST_CHATS);
  const hasMorePastChats = sessions.length > MAX_PAST_CHATS;

  const currentSessionRef = useRef<string | null>(null);
  useEffect(() => {
    currentSessionRef.current = currentSessionId;
  }, [currentSessionId]);
  const isLoading = status === 'streaming' || status === 'submitted' || notes9Loading;
  const isUploading = uploadQueue.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/files/upload', { method: 'POST', body: formData });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }
      const data = await response.json();
      return {
        url: data.url,
        name: data.pathname,
        contentType: data.contentType,
        size: data.size,
      };
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload');
      return null;
    }
  }, []);

  const handleFileSelect = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const validFiles = files.filter((file) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large`);
        return false;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name} type not supported`);
        return false;
      }
      return true;
    });
    if (validFiles.length === 0) return;
    setUploadQueue(validFiles.map((f) => f.name));
    const results = await Promise.all(validFiles.map((f) => uploadFile(f)));
    const successful = results.filter((r): r is Attachment => r !== null);
    setAttachments((prev) => [...prev, ...successful]);
    setUploadQueue([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadFile]);

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    event.preventDefault();
    setUploadQueue(['Pasted image']);
    const files = imageItems.map((item) => item.getAsFile()).filter((file): file is File => file !== null);
    const results = await Promise.all(files.map((f) => uploadFile(f)));
    const successful = results.filter((r): r is Attachment => r !== null);
    setAttachments((prev) => [...prev, ...successful]);
    setUploadQueue([]);
  }, [uploadFile]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.addEventListener('paste', handlePaste);
    return () => textarea.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading || isUploading) return;

    const text = input;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);

    const isFirstMessageInSession = messages.length === 0;
    if (!currentSessionRef.current) {
      const sessionId = await createSession();
      if (sessionId) {
        currentSessionRef.current = sessionId;
        const title = text.trim().slice(0, 50) || 'New conversation';
        updateSessionTitle(sessionId, title);
      } else {
        toast.error("Failed to start new chat session");
        return;
      }
    } else if (isFirstMessageInSession) {
      // Existing session but no messages yet (e.g. New Chat then type) – set title from first message
      const title = text.trim().slice(0, 50) || 'New conversation';
      updateSessionTitle(currentSessionRef.current, title);
    }

    if (agentMode === 'notes9') {
      try {
        setNotes9Loading(true);
        const userMessageId = `user-${Date.now()}`;
        const userMessage = {
          id: userMessageId,
          role: 'user' as const,
          content: text,
          parts: [{ type: 'text' as const, text }],
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);

        const sessionId = currentSessionRef.current!;
        await saveMessage(sessionId, 'user', text);

        // Call Notes9 API
        const response = await fetch('https://z3thrlksg0.execute-api.us-east-1.amazonaws.com/agent/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            history: [],
            query: text,
            session_id: sessionId,
            user_id: userId,
          }),
        });

        if (!response.ok) throw new Error('Notes9 API request failed');
        const data = await response.json();
        let formattedAnswer = data.answer;

        // Citation handling...
        if (data.citations && data.citations.length > 0) {
          formattedAnswer += '\n\n**References:**\n';
          data.citations.forEach((citation: any, index: number) => {
            const sourceId = citation.source_id;
            const sourceType = citation.source_type;
            let route = '';
            switch (sourceType) {
              case 'literature_review':
                route = `/literature-reviews/${sourceId}`;
                break;
              case 'protocol':
                route = `/protocols/${sourceId}`;
                break;
              case 'project':
                route = `/projects/${sourceId}`;
                break;
              case 'lab_note':
              case 'report':
              default:
                route = '';
            }
            const displayText = formatCitationDisplay(citation);
            const sourceLabel = sourceType.replace('_', ' ');
            if (route) {
              formattedAnswer += `\n[${index + 1}] [View ${sourceLabel}](${route}): ${displayText}`;
            } else {
              formattedAnswer += `\n[${index + 1}] ${sourceLabel}: ${displayText}`;
            }
          });
        }

        const assistantMessageId = `assistant-${Date.now()}`;
        const assistantMessage = {
          id: assistantMessageId,
          role: 'assistant' as const,
          content: formattedAnswer,
          parts: [{ type: 'text' as const, text: formattedAnswer }],
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        await saveMessage(sessionId, 'assistant', formattedAnswer);
        loadSessions();
      } catch (error) {
        console.error('Notes9 API error:', error);
        toast.error('Failed to get response from Notes9');
      } finally {
        setNotes9Loading(false);
      }
      return;
    }

    const parts: Array<{ type: 'text'; text: string } | { type: 'file'; url: string; name: string; mediaType: string }> = [];
    for (const attachment of currentAttachments) {
      parts.push({ type: 'file', url: attachment.url, name: attachment.name, mediaType: attachment.contentType });
    }
    if (text.trim()) parts.push({ type: 'text', text });
    await sendMessage({ parts });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNewChat = async () => {
    const sessionId = await createSession();
    if (sessionId) {
      currentSessionRef.current = sessionId;
      setMessages([]);
      setAttachments([]);
    }
  };

  const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentSessionId === sessionId) {
      setMessages([]);
      currentSessionRef.current = null;
    }
    deleteSession(sessionId);
    toast.success('Chat deleted');
  }, [currentSessionId, deleteSession, setMessages]);

  const loadSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    currentSessionRef.current = sessionId;
    loadMessages(sessionId).then((msgs) => {
      const chatMessages = msgs.map((m) => {
        let text = m.content;
        const trimmed = (m.content || '').trim();
        if (trimmed.startsWith('[') && trimmed.includes('"type"') && trimmed.includes('"text"')) {
          try {
            const parsed = JSON.parse(m.content) as Array<{ type?: string; text?: string }>;
            if (Array.isArray(parsed)) {
              text = parsed
                .filter((p) => p?.type === 'text' && typeof p.text === 'string')
                .map((p) => p.text!)
                .join('');
            }
          } catch {
            // keep original text
          }
        }
        return {
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: text,
          parts: [{ type: 'text' as const, text }],
          createdAt: new Date(m.created_at),
        };
      });
      setMessages(chatMessages);

      // If session has no meaningful title but has messages, set title from first user message
      const session = sessions.find((s) => s.id === sessionId);
      const needsTitle = !session?.title || session.title === 'New conversation' || session.title.trim() === '';
      const firstUser = msgs.find((m) => m.role === 'user');
      const firstUserText = firstUser?.content?.trim();
      if (needsTitle && firstUserText) {
        const title = firstUserText.slice(0, 50) || 'New conversation';
        updateSessionTitle(sessionId, title);
      }
    });
  }

  // --- Render Components ---

  const renderCursorInput = () => (
    <div className="group/input relative flex flex-col w-full">
      {/* Attachments Preview */}
      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {attachments.map((attachment, index) => (
            <PreviewAttachment key={attachment.url} attachment={attachment} onRemove={() => handleRemoveAttachment(index)} compact />
          ))}
          {uploadQueue.map((name) => (
            <PreviewAttachment key={name} attachment={{ url: '', name, contentType: '' }} isUploading compact />
          ))}
        </div>
      )}

      <div className={cn(
        "rounded-xl border bg-card/50 shadow-sm focus-within:ring-1 focus-within:ring-ring/50 focus-within:border-ring transition-all overflow-hidden",
        isDraggingContext && "ring-2 ring-primary border-primary bg-primary/5"
      )}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize
            if (inputRef.current) {
              inputRef.current.style.height = 'auto';
              inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 300)}px`;
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Plan, @ for context, / for commands"
          className="w-full min-h-[52px] resize-none bg-transparent px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none scrollbar-hide"
          disabled={isLoading || contextLoading}
          autoFocus
        />

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-between gap-2 px-2 pb-2 mt-1 min-h-[28px]">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {/* Mode Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground px-2 text-xs font-medium">
                  {agentMode === 'notes9' ? (
                    <><FlaskConical className="size-3.5" /> Notes9</>
                  ) : (
                    <><Globe className="size-3.5" /> General</>
                  )}
                  <ChevronDown className="size-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[150px]">
                <DropdownMenuItem onClick={() => setAgentMode('general')} className="gap-2 text-xs">
                  <Globe className="size-3.5" /> General
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAgentMode('notes9')} className="gap-2 text-xs">
                  <FlaskConical className="size-3.5" /> Notes9
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-foreground" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
              <Paperclip className="size-4" />
            </Button>

            {isLoading ? (
              <Button size="icon" variant="secondary" className="size-7 rounded-sm animate-pulse" onClick={stop}>
                <Square className="size-3 fill-current" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className={cn("size-7 text-muted-foreground hover:text-primary transition-colors", (input.trim() || attachments.length > 0) && "text-primary")} onClick={(e) => handleSubmit(e as any)} disabled={(!input.trim() && attachments.length === 0) || isUploading}>
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  /** Format session time: always 2 chars — "0m".."9m", "1h".."9h", "1d".."9d" (cap at 9 for h/d). */
  const formatSessionTime = (updatedAt: string): string => {
    const date = new Date(updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffMins < 1) return '0m';
    if (diffMins < 60) return diffMins <= 9 ? `${diffMins}m` : '1h';
    if (diffHours < 24) return diffHours <= 9 ? `${diffHours}h` : '9h';
    return diffDays <= 9 ? `${diffDays}d` : '9d';
  };

  const SessionItem = ({ session }: { session: ChatSession }) => (
    <div className="group/item grid grid-cols-[1fr_28px] gap-1 w-full min-w-0 items-center rounded-lg">
      <button
        type="button"
        onClick={() => loadSession(session.id)}
        className={cn(
          "min-w-0 flex items-center justify-between gap-2 px-3 py-2 text-left text-sm rounded-lg transition-colors overflow-hidden",
          currentSessionId === session.id
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
        )}
      >
        <span className="text-[10px] shrink-0 opacity-70 whitespace-nowrap opacity-0 transition-opacity group-hover/item:opacity-70 mr-2">
          {formatSessionTime(session.updated_at)}
        </span>
        <span className="truncate min-w-0 flex-1">{session.title || 'New conversation'}</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 col-start-2 text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover/item:opacity-100"
        onClick={(e) => handleDeleteSession(e, session.id)}
        aria-label="Delete chat"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );

  /** Extract plain text from message. Handles string, array of parts (object or stringified JSON). Never returns raw JSON to the UI. */
  const getMessageContent = (message: (typeof messages)[0]): string => {
    let raw = '';

    const content = (message as { content?: unknown }).content;

    // 1) message.content as array (e.g. from stream)
    if (content != null && Array.isArray(content)) {
      raw = (content as Array<{ type?: string; text?: string }>)
        .filter((p) => p?.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text!)
        .join('');
    }

    // 2) message.parts (text parts only)
    if (!raw && message.parts?.length) {
      raw = message.parts
        .filter((p) => p.type === 'text')
        .map((p) => ('text' in p ? String(p.text ?? '') : ''))
        .join('');
    }

    // 3) message.content as string
    if (!raw && content != null && typeof content === 'string') {
      raw = content;
    }

    if (!raw) return '';

    // Always normalize so we never pass raw JSON to the renderer
    return normalizeContentString(raw);
  };

  /** If string is stringified JSON parts (single or double/triple wrapped), unwrap to plain text. Never return raw JSON. */
  function normalizeContentString(raw: string): string {
    let s = raw.trim();
    if (!s) return '';

    const maxUnwrap = 5;
    for (let i = 0; i < maxUnwrap; i++) {
      const looksLikeJsonParts =
        (s.startsWith('[') || s.includes('[')) && s.includes('"type"') && s.includes('"text"');
      if (!looksLikeJsonParts) return s;
      try {
        const parsed = JSON.parse(s) as Array<{ type?: string; text?: string }>;
        if (!Array.isArray(parsed)) return s;
        const text = parsed
          .filter((p) => p?.type === 'text' && typeof p.text === 'string')
          .map((p) => p.text!)
          .join('');
        if (!text || text === s) return s;
        s = text;
      } catch {
        const segments: string[] = [];
        const re = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(s)) !== null) {
          segments.push(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'));
        }
        if (segments.length === 0 && /"text"\s*:\s*"/.test(s)) {
          const valueStart = s.indexOf('"text"');
          const afterKey = s.indexOf('"', valueStart + 6) + 1;
          if (afterKey > 0) segments.push(s.slice(afterKey).replace(/\\"/g, '"').replace(/\\n/g, '\n'));
        }
        return segments.length > 0 ? segments.join('') : s;
      }
    }
    return s;
  }

  return (
    <div className={cn(
      "flex flex-col bg-background border-l min-h-0 overflow-hidden",
      isExpanded
        ? "fixed top-0 right-0 bottom-0 left-[var(--sidebar-width,0px)] z-50 w-auto h-full transition-none"
        : "h-full w-full min-w-0 transition-none"
    )}>
      {/* Hidden File Input */}
      <input ref={fileInputRef} type="file" multiple accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={handleFileSelect} disabled={isLoading || isUploading} />

      {!mounted ? (
        <div className="flex-1 flex items-center justify-center">
          <Sparkles className="size-6 text-muted-foreground/50 animate-pulse" />
        </div>
      ) : (
        <>
          {/* Header: Tab-like Navigation (History + New Chat hidden when maximized; left sidebar has them) */}
          <header className="h-12 sm:h-14 flex items-center justify-between px-2 sm:px-3 border-b shrink-0 bg-background/50 backdrop-blur z-10 text-xs select-none">
            <div className="flex items-center gap-1 overflow-hidden">
              {isExpanded && !expandedHistoryOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground shrink-0"
                  onClick={() => setExpandedHistoryOpen(true)}
                  aria-label="Show chat history"
                >
                  <History className="size-3.5" />
                </Button>
              )}
              {!isExpanded && (
                <>
                  <ScrollArea className="w-full whitespace-nowrap scrollbar-hide">
                    <div className="flex items-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label="Chat history"
                            className={cn(
                              "px-3 py-1.5 rounded-md flex items-center justify-center transition-colors",
                              currentSessionId ? "bg-accent/40 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                            )}
                          >
                            <History className="size-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[280px] max-w-[min(280px,90vw)] p-0 overflow-hidden" sideOffset={4}>
                          <div className="p-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider border-b shrink-0">
                            History
                          </div>
                          <ScrollArea className="max-h-[280px] overflow-hidden">
                            <div className="p-1 min-w-0">
                              {sessions.length === 0 ? (
                                <div className="py-6 text-center text-muted-foreground text-xs">No history yet.</div>
                              ) : (
                                sessions.map(session => (
                                  <div key={session.id} className="flex items-center gap-1 group/hist w-full min-w-0 rounded-md">
                                    <button
                                      type="button"
                                      onClick={() => loadSession(session.id)}
                                      className={cn(
                                        "flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-2 text-left text-sm rounded-md transition-colors overflow-hidden",
                                        currentSessionId === session.id
                                          ? "bg-accent text-accent-foreground"
                                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                      )}
                                    >
                                      <span className="truncate min-w-0 flex-1">{session.title || 'New conversation'}</span>
                                      <span className="text-[10px] shrink-0 opacity-70">
                                        {new Date(session.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                      </span>
                                    </button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                                      onClick={(e) => handleDeleteSession(e, session.id)}
                                      aria-label="Delete chat"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                ))
                              )}
                            </div>
                          </ScrollArea>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <button
                        onClick={handleNewChat}
                        className={cn(
                          "px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors",
                          !currentSessionId ? "bg-accent/40 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        )}
                      >
                        <PenBox className="size-3.5" />
                        <span>New Chat</span>
                      </button>
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 pl-2">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setIsExpanded(!isExpanded)}>
                {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </Button>
            </div>
          </header>

          {/* When full screen: left = conversation list, right = chat. Otherwise: single column. */}
          <div className={cn("flex-1 flex min-h-0 overflow-hidden", isExpanded ? "flex-row" : "flex-col")}>
            {/* Full-screen only: left sidebar with previous conversations (lab-notes-style, toggleable) */}
            {isExpanded && expandedHistoryOpen && (
              <aside className="w-56 flex-shrink-0 flex flex-col overflow-hidden border-r border-border bg-sidebar transition-[width] duration-200 ease-in-out min-h-0">
                <div className="flex h-full min-h-0 flex-col gap-1 p-2">
                  {/* Header row - back arrow to hide history (like lab notes collapse) */}
                  <div className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-xs font-medium text-sidebar-foreground/70">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 -ml-0.5"
                      onClick={() => setExpandedHistoryOpen(false)}
                      aria-label="Hide chat history"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="flex-1 truncate">Chats</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={handleNewChat}
                      aria-label="New chat"
                    >
                      <PenBox className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* List - same structure as lab notes */}
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
                    {sessions.length === 0 ? (
                      <div className="px-2 py-6 text-center text-sidebar-foreground/70 text-xs">No previous conversations.</div>
                    ) : (
                      <ul className="flex w-full min-w-0 flex-col gap-0.5">
                        {sessions.map((session) => (
                          <li key={session.id} className="group/row relative">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => loadSession(session.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadSession(session.id); } }}
                              className={cn(
                                "grid w-full min-h-9 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                currentSessionId === session.id && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              )}
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center text-[10px] text-sidebar-foreground/70 tabular-nums whitespace-nowrap" aria-hidden>
                                {formatSessionTime(session.updated_at)}
                              </span>
                              <span className="min-w-0 truncate font-medium block">{session.title || 'New conversation'}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0 opacity-70 hover:opacity-100 text-sidebar-foreground/70 hover:text-destructive"
                                onClick={(e) => handleDeleteSession(e, session.id)}
                                aria-label="Delete chat"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </aside>
            )}

            {/* Main chat area (narrow: only this; full screen: right side) */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
              {messages.length === 0 ? (
                // --- Empty State: input at bottom; full screen = compact bar, narrow = full input card ---
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <div className="flex-1 flex flex-col items-center justify-center px-4">
                    <div className="relative mb-2">
                      <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-orange-400 to-pink-500 opacity-25 blur-xl" />
                      <Sparkles className="relative size-8 text-orange-500" />
                    </div>
                    <h2 className="text-lg font-bold tracking-tight bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-transparent">
                      Catalyst AI
                    </h2>
                    <p className="text-muted-foreground text-center max-w-xs text-sm">
                      Your intelligent research assistant. Ask anything about your lab notes, experiments, or protocols.
                    </p>
                  </div>

                  {/* Input at bottom (General, model, textarea) */}
                  <div className="flex-shrink-0 p-4 bg-background/95 backdrop-blur border-t">
                    <div className="max-w-3xl mx-auto min-w-0">
                      {renderCursorInput()}
                    </div>
                  </div>
                </div>
              ) : (
                // --- Active Chat View ---
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                  {/* Messages Area - single scroll container */}
                  <ScrollArea className="flex-1 min-h-0 basis-0 overflow-hidden">
                    <div className="flex flex-col gap-6 p-4 pt-5 pb-20 max-w-3xl mx-auto w-full min-w-0">
                      {messages.map((message, index) => {
                        const content = getMessageContent(message);
                        const isLastAssistant = message.role === 'assistant' && index === messages.length - 1;
                        return (
                          <div key={message.id} className={cn('group/message flex gap-4 w-full', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                            {message.role === 'assistant' && (
                              <div className="size-7 shrink-0 flex items-center justify-center rounded-full bg-background border shadow-sm mt-1">
                                <Sparkles className="size-3.5 text-primary" />
                              </div>
                            )}
                            <div className={cn("flex flex-col min-w-0 max-w-[85%]", message.role === 'user' ? "items-end" : "items-start")}>
                              <div className={cn("text-sm leading-relaxed whitespace-pre-wrap break-words overflow-visible", message.role === 'user' ? "bg-primary/5 text-foreground px-4 py-2.5 rounded-2xl rounded-tr-sm" : "prose prose-sm dark:prose-invert max-w-none min-w-0 text-foreground")}>
                                {message.role === 'user' ? content : <MarkdownRenderer content={content} className="text-sm text-foreground" />}
                              </div>
                              <div className="mt-1 opacity-0 group-hover/message:opacity-100 transition-opacity px-1">
                                <MessageActions sessionId={currentSessionId} messageId={message.id} messageRole={message.role as 'user' | 'assistant'} messageContent={content} isLoading={isLoading} onRegenerate={isLastAssistant ? () => regenerate() : undefined} compact />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {isLoading && messages.at(-1)?.role === 'user' && (
                        <div className="flex gap-3 items-center justify-start w-full">
                          <div className="size-7 shrink-0 flex items-center justify-center rounded-full bg-background border shadow-sm">
                            <Sparkles className="size-3.5 text-primary animate-pulse" />
                          </div>
                          <div className="text-sm text-muted-foreground italic">Thinking...</div>
                        </div>
                      )}
                      <div ref={messagesEndRef} className="h-4" />
                    </div>
                  </ScrollArea>

                  {/* Fixed Input at Bottom */}
                  <div className="flex-shrink-0 p-4 bg-background/95 backdrop-blur z-20 border-t">
                    <div className="max-w-3xl mx-auto min-w-0">
                      {renderCursorInput()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
