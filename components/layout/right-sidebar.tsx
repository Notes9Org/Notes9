'use client';

import Image from 'next/image';
import { useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
  MessageSquare,
  NotebookPen,
  PenBox,
  MoreHorizontal,
  Trash2,
  ChevronDown,
  ChevronLeft,
  X,
  Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatNotes9AssistantMarkdown,
  isPersistedChatMessageId,
} from '@/lib/notes9-chat-format';
import { useAgentStream } from '@/hooks/use-agent-stream';
import { deleteTrailingMessages } from '@/app/(app)/catalyst/actions';
import { MessageEditor } from '@/components/catalyst/message-editor';
import { AgentStreamReply } from '@/components/catalyst/agent-stream-reply';
import { useChatSessions, ChatSession } from '@/hooks/use-chat-sessions';
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer';
import { PreviewAttachment, type Attachment } from '@/components/catalyst/preview-attachment';
import { MessageActions } from '@/components/catalyst/message-actions';
import { Notes9LoaderGif } from '@/components/brand/notes9-loader-gif';
import { Notes9VideoLoader } from '@/components/brand/notes9-video-loader';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useResizable } from '@/hooks/use-resizable';
import { ResizeHandle } from '@/components/ui/resize-handle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from '@/components/ui/switch';
import { usePaperAI } from '@/contexts/paper-ai-context';
import { PaperAIPanel } from '@/components/text-editor/paper-ai-panel';

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
const MAX_CHAT_CHARS = 4096;

interface RightSidebarProps {
  onClose?: () => void;
}

export function RightSidebar({ onClose }: RightSidebarProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const paperAI = usePaperAI();
  const [input, setInput] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>('general');
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(() => new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
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
  const previousPathnameRef = useRef(pathname);
  const historySidebar = useResizable({
    initialWidth: 224,
    minWidth: 208,
    maxWidth: 420,
    direction: 'left',
  });

  const resizeInput = useCallback((reset = false) => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    if (reset || !textarea.value.trim()) {
      textarea.style.height = '52px';
      return;
    }
    textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`;
  }, []);

  // Cursor-like UI States
  // If messages.length === 0 => "New Chat View" (Input at top/center, Past Chats at bottom)
  // If messages.length > 0 => "Active Chat View" (Messages take space, Input at bottom)

  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const supabaseTokenRef = useRef<string | null>(null);
  const webSearchEnabledRef = useRef(true);

  useEffect(() => {
    webSearchEnabledRef.current = webSearchEnabled;
  }, [webSearchEnabled]);

  useEffect(() => {
    const loadUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    loadUserId();
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabaseTokenRef.current = session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      supabaseTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest(request) {
      const token = supabaseTokenRef.current;
      const normalizedMessages = request.messages.map((msg: { role: string; content?: unknown; parts?: Array<{ type?: string; text?: string }> }) => {
        const plainText = getPlainTextFromMessage(msg);
        return { role: msg.role, content: plainText };
      });
      return {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: {
          messages: normalizedMessages,
          sessionId: currentSessionRef.current,
          supabaseToken: token ?? undefined,
          webSearch: webSearchEnabledRef.current,
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

  const agentStream = useAgentStream();

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
  }, [messages, agentStream.thinkingSteps, agentStream.streamedAnswer, agentStream.donePayload, agentStream.thinkingSteps, agentStream.streamedAnswer, agentStream.donePayload, agentStream.thinkingSteps, agentStream.streamedAnswer, agentStream.donePayload]);

  useEffect(() => {
    resizeInput();
  }, [input, isLoading, resizeInput]);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname && isExpanded) {
      setIsExpanded(false);
    }
    previousPathnameRef.current = pathname;
  }, [pathname, isExpanded]);

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
    requestAnimationFrame(() => resizeInput(true));

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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error('Please sign in to use Notes9');
        router.push('/auth/login');
        return;
      }

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
      const savedUser = await saveMessage(sessionId, 'user', text);
      if (savedUser) {
        setSavedMessageIds((prev) => new Set(prev).add(savedUser.id));
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'user' && last.id === userMessageId) {
            next[next.length - 1] = { ...last, id: savedUser.id };
          }
          return next;
        });
      }

      const history = messages.map((m) => ({
        role: m.role,
        content: getPlainTextFromMessage(m),
      }));

      setNotes9Loading(true);
      const { donePayload, error } = await agentStream.runStream(
        {
          query: text,
          session_id: sessionId,
          history,
        },
        token
      );
      setNotes9Loading(false);

      if (donePayload) {
        const formattedAnswer = formatNotes9AssistantMarkdown(donePayload);

        const assistantMessageId = `assistant-${Date.now()}`;
        const assistantMessage = {
          id: assistantMessageId,
          role: 'assistant' as const,
          content: formattedAnswer,
          parts: [{ type: 'text' as const, text: formattedAnswer }],
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        const savedAsst = await saveMessage(sessionId, 'assistant', formattedAnswer);
        if (savedAsst) {
          setSavedMessageIds((prev) => new Set(prev).add(savedAsst.id));
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant' && last.id === assistantMessageId) {
              next[next.length - 1] = { ...last, id: savedAsst.id };
            }
            return next;
          });
        }
        loadSessions();
        agentStream.reset();
      } else if (error) {
        toast.error(error);
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

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      if (isPersistedChatMessageId(messageId)) {
        await deleteTrailingMessages({ id: messageId });
        const newSavedIds = new Set<string>();
        for (let i = 0; i < messageIndex; i++) {
          if (isPersistedChatMessageId(messages[i].id)) {
            newSavedIds.add(messages[i].id);
          }
        }
        setSavedMessageIds(newSavedIds);
      }

      const history = messages.slice(0, messageIndex).map((m) => ({
        role: m.role,
        content: getPlainTextFromMessage(m),
      }));

      setMessages((currentMessages) => {
        const index = currentMessages.findIndex((m) => m.id === messageId);
        if (index !== -1) {
          const updatedMessage = {
            ...currentMessages[index],
            parts: [{ type: 'text' as const, text: newContent }],
          };
          return [...currentMessages.slice(0, index), updatedMessage];
        }
        return currentMessages;
      });

      const sid = currentSessionRef.current;
      if (!sid) return;

      if (agentMode === 'notes9') {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          toast.error('Please sign in to use Notes9');
          return;
        }

        const savedUser = await saveMessage(sid, 'user', newContent);
        if (savedUser) {
          setSavedMessageIds((prev) => new Set(prev).add(savedUser.id));
          setMessages((curr) => {
            const idx = curr.findIndex((m) => m.id === messageId);
            if (idx === -1) return curr;
            return [
              ...curr.slice(0, idx),
              {
                ...curr[idx],
                id: savedUser.id,
                parts: [{ type: 'text' as const, text: newContent }],
              },
            ];
          });
        }

        setNotes9Loading(true);
        const { donePayload, error } = await agentStream.runStream(
          { query: newContent, session_id: sid, history },
          token
        );
        setNotes9Loading(false);

        if (donePayload) {
          const formattedAnswer = formatNotes9AssistantMarkdown(donePayload);
          const assistantMessageId = `assistant-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMessageId,
              role: 'assistant' as const,
              content: formattedAnswer,
              parts: [{ type: 'text' as const, text: formattedAnswer }],
              createdAt: new Date(),
            },
          ]);
          const savedAsst = await saveMessage(sid, 'assistant', formattedAnswer);
          if (savedAsst) {
            setSavedMessageIds((prev) => new Set(prev).add(savedAsst.id));
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant' && last.id === assistantMessageId) {
                next[next.length - 1] = { ...last, id: savedAsst.id };
              }
              return next;
            });
          }
          loadSessions();
          agentStream.reset();
        } else if (error) {
          toast.error(error);
        }
        return;
      }

      regenerate();
    },
    [messages, setMessages, regenerate, agentMode, supabase, saveMessage, loadSessions, agentStream]
  );

  const handleRegenerate = useCallback(async () => {
    if (messages.length < 2) return;

    const sid = currentSessionRef.current;
    if (!sid) return;

    if (agentMode === 'notes9') {
      const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');
      if (lastAssistantIndex === -1) return;
      const lastUserMessage = messages[lastAssistantIndex - 1];
      if (lastUserMessage?.role !== 'user') return;

      const lastAssistantMessage = messages[lastAssistantIndex];
      if (isPersistedChatMessageId(lastAssistantMessage.id)) {
        await deleteTrailingMessages({ id: lastAssistantMessage.id });
        setSavedMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(lastAssistantMessage.id);
          return next;
        });
      }

      setMessages((curr) => curr.slice(0, lastAssistantIndex));

      const query = getPlainTextFromMessage(lastUserMessage);
      const history = messages.slice(0, lastAssistantIndex - 1).map((m) => ({
        role: m.role,
        content: getPlainTextFromMessage(m),
      }));

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error('Please sign in to use Notes9');
        return;
      }

      setNotes9Loading(true);
      const { donePayload, error } = await agentStream.runStream(
        { query, session_id: sid, history },
        token
      );
      setNotes9Loading(false);

      if (donePayload) {
        const formattedAnswer = formatNotes9AssistantMarkdown(donePayload);
        const assistantMessageId = `assistant-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: 'assistant' as const,
            content: formattedAnswer,
            parts: [{ type: 'text' as const, text: formattedAnswer }],
            createdAt: new Date(),
          },
        ]);
        const savedAsst = await saveMessage(sid, 'assistant', formattedAnswer);
        if (savedAsst) {
          setSavedMessageIds((prev) => new Set(prev).add(savedAsst.id));
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant' && last.id === assistantMessageId) {
              next[next.length - 1] = { ...last, id: savedAsst.id };
            }
            return next;
          });
        }
        loadSessions();
        agentStream.reset();
      } else if (error) {
        toast.error(error);
      }
      return;
    }

    const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');
    if (lastAssistantIndex === -1) return;
    const lastAssistantMessage = messages[lastAssistantIndex];

    if (isPersistedChatMessageId(lastAssistantMessage.id)) {
      await deleteTrailingMessages({ id: lastAssistantMessage.id });
      setSavedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(lastAssistantMessage.id);
        return next;
      });
    }

    regenerate();
  }, [messages, regenerate, agentMode, supabase, saveMessage, loadSessions, agentStream]);

  /** Stops Notes9 agent stream or useChat streaming. */
  const handleStopRequest = useCallback(() => {
    if (notes9Loading) {
      agentStream.abort();
      agentStream.reset();
    } else {
      stop();
    }
  }, [notes9Loading, agentStream, stop]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNewChat = async () => {
    if (isLoading) {
      toast.error('Wait for the current response to finish before switching chats.');
      return;
    }
    const sessionId = await createSession();
    if (sessionId) {
      currentSessionRef.current = sessionId;
      setMessages([]);
      setAttachments([]);
      setSavedMessageIds(new Set());
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
    if (isLoading) {
      toast.error('Wait for the current response to finish before switching chats.');
      return;
    }
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
      setSavedMessageIds(new Set(msgs.map((m) => m.id)));

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
      )} id="tour-ai-chat">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            resizeInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Plan, @ for context, / for commands"
          className="w-full min-h-[52px] resize-none bg-transparent px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none scrollbar-hide"
          disabled={isLoading || contextLoading}
          autoFocus
          maxLength={MAX_CHAT_CHARS}
        />

        {/* Bottom Toolbar — merge: keep `min-h-9` on this row and the trailing `h-9 … justify-end` wrapper so stop/send stay aligned (main used `min-h-[28px]` + `rounded-sm` stop; do not restore those here). */}
        <div className="mt-1 flex min-h-9 items-center justify-between gap-2 px-2 pb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {/* Mode Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button id="tour-ai-mode" variant="ghost" size="sm" className="h-7 gap-1.5 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground px-2 text-xs font-medium">
                  {agentMode === 'notes9' ? (
                    <><NotebookPen className="size-3.5" /> Notes9</>
                  ) : (
                    <><MessageSquare className="size-3.5" /> General</>
                  )}
                  <ChevronDown className="size-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[150px]">
                <DropdownMenuItem onClick={() => setAgentMode('general')} className="gap-2 text-xs">
                  <MessageSquare className="size-3.5" /> General
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAgentMode('notes9')} className="gap-2 text-xs">
                  <NotebookPen className="size-3.5" /> Notes9
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {agentMode === 'general' && (
              <div className="flex items-center gap-1.5 shrink-0 pl-2 ml-1 border-l border-border/50">
                <Globe className="size-3.5 text-muted-foreground" aria-hidden />
                <Switch
                  checked={webSearchEnabled}
                  onCheckedChange={setWebSearchEnabled}
                  disabled={isLoading}
                  className="scale-90"
                  aria-label="Web search"
                />
              </div>
            )}
          </div>

          <div className="flex h-9 shrink-0 items-center justify-end gap-1">
            <span className="mr-1 hidden text-[11px] text-muted-foreground sm:inline">
              {input.length}/{MAX_CHAT_CHARS}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <Paperclip className="size-4" />
            </Button>

            {isLoading ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="size-7 animate-pulse"
                aria-label="Stop generating"
                title="Stop generating"
                onClick={handleStopRequest}
              >
                <Square className="size-3 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  "size-7 text-muted-foreground transition-colors hover:text-primary",
                  (input.trim() || attachments.length > 0) && "text-primary",
                )}
                onClick={(e) => handleSubmit(e as any)}
                disabled={(!input.trim() && attachments.length === 0) || isUploading}
              >
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
      "flex flex-col bg-background border-l border-border/45 min-h-0 overflow-hidden shadow-[-2px_0_18px_-16px_rgba(44,36,24,0.22)] dark:shadow-[-2px_0_18px_-16px_rgba(0,0,0,0.45)]",
      isExpanded
        ? "fixed top-0 right-0 bottom-0 left-[var(--sidebar-width,0px)] z-50 w-auto h-full transition-none"
        : "h-full w-full min-w-0 transition-none"
    )}>
      {/* Hidden File Input */}
      <input ref={fileInputRef} type="file" multiple accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={handleFileSelect} disabled={isLoading || isUploading} />

      {!mounted ? (
        <div className="flex flex-1 items-center justify-center">
          <Sparkles className="size-6 -translate-y-[5px] text-muted-foreground/50 animate-pulse" />
        </div>
      ) : paperAI?.isActive ? (
        <PaperAIPanel
          open
          embedded
          onClose={() => onClose?.()}
          paperContent={paperAI.paperContent}
          onInsert={paperAI.onInsert}
          paperTitle={paperAI.paperTitle}
          getEditorContext={paperAI.getEditorContext}
        />
      ) : (
        <>
          {/* Header: Tab-like Navigation (History + New Chat hidden when maximized; left sidebar has them) */}
            <header className="h-12 sm:h-14 flex items-center justify-between px-2 sm:px-4 border-b border-border/40 shrink-0 bg-[color:var(--n9-header-bg)]/80 backdrop-blur-md z-10 text-xs select-none">
            <div className="flex items-center gap-1 overflow-hidden">
              {isExpanded && !expandedHistoryOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 sm:size-9 text-muted-foreground shrink-0"
                  onClick={() => setExpandedHistoryOpen(true)}
                  aria-label="Show chat history"
                >
                    <History className="size-4" />
                </Button>
              )}
              {!isExpanded && (
                <>
                  <ScrollArea className="w-full whitespace-nowrap scrollbar-hide">
                    <div className="flex items-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 sm:size-9 text-muted-foreground shrink-0"
                              aria-label="Show chat history"
                          >
                              <History className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="flex w-[290px] max-w-[min(290px,calc(100vw-2rem))] flex-col p-0 overflow-hidden" sideOffset={4}>
                          <div className="p-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider border-b shrink-0">
                            History
                          </div>
                          <ScrollArea className="h-[280px] w-full overflow-hidden">
                            <div className="min-w-max p-1">
                              {sessions.length === 0 ? (
                                <div className="py-6 text-center text-muted-foreground text-xs">No history yet.</div>
                              ) : (
                                sessions.map(session => (
                                  <div key={session.id} className="group/hist relative flex w-full min-w-max items-center overflow-hidden rounded-md pr-1">
                                    <button
                                      type="button"
                                      onClick={() => loadSession(session.id)}
                                      className={cn(
                                        "flex min-w-max max-w-full items-center justify-between gap-3 overflow-hidden rounded-md px-2 py-1.5 pr-12 text-left text-sm transition-colors",
                                        currentSessionId === session.id
                                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                          : "text-muted-foreground hover:text-foreground"
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "block whitespace-nowrap rounded-full px-2.5 py-1 transition-colors",
                                          currentSessionId === session.id
                                            ? "bg-sidebar-accent-foreground/12 text-sidebar-accent-foreground"
                                            : "group-hover/hist:bg-gradient-to-r group-hover/hist:from-[var(--primary)]/28 group-hover/hist:via-[var(--accent)]/85 group-hover/hist:to-[var(--accent)]/32"
                                        )}
                                        title={session.title || 'New conversation'}
                                      >
                                        {session.title || 'New conversation'}
                                      </span>
                                      <span className="text-[10px] shrink-0 opacity-70">
                                        {new Date(session.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                      </span>
                                    </button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        "absolute right-1 top-1/2 z-10 h-7 w-7 -translate-y-1/2 rounded-full border border-border/35 bg-background/82 text-destructive shadow-sm backdrop-blur-md transition-opacity hover:bg-background hover:text-destructive",
                                        currentSessionId === session.id ? "opacity-100" : "opacity-0 group-hover/hist:opacity-100"
                                      )}
                                      onClick={(e) => handleDeleteSession(e, session.id)}
                                      aria-label="Delete chat"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                ))
                              )}
                            </div>
                            <ScrollBar orientation="horizontal" />
                          </ScrollArea>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button
                        variant="secondary"
                        className="h-8 sm:h-9 text-muted-foreground"
                        onClick={handleNewChat}
                        aria-label="New chat"
                      >
                        <Plus className="size-4" />
                        <span>New Chat</span>
                      </Button>
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 pl-2">
              <Button variant="ghost" size="icon" className="size-8 sm:size-9 text-muted-foreground" onClick={() => setIsExpanded(!isExpanded)}>
                  {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="size-8 sm:size-9 text-muted-foreground" onClick={() => onClose?.()}>
                  <X className="size-4" />
                </Button>
            </div>
          </header>

          {/* When full screen: left = conversation list, right = chat. Otherwise: single column. */}
          <div className={cn("flex-1 flex min-h-0 overflow-hidden", isExpanded ? "flex-row" : "flex-col")}>
            {/* Full-screen only: left sidebar with previous conversations (lab-notes-style, toggleable) */}
            {isExpanded && expandedHistoryOpen && (
              <>
                <aside
                  className="flex-shrink-0 flex flex-col overflow-hidden border-r border-border bg-sidebar transition-[width] duration-200 ease-in-out min-h-0"
                  style={{
                    width: historySidebar.width,
                    transition: historySidebar.isResizing ? 'none' : 'width 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
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
                  <ScrollArea className="min-h-0 flex-1 overflow-hidden">
                    {sessions.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sidebar-foreground/70 text-xs">No previous conversations.</div>
                    ) : (
                      <ul className="flex min-w-0 flex-col gap-0.5 pr-1">
                        {sessions.map((session) => (
                          <li key={session.id} className="group/row relative">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => loadSession(session.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadSession(session.id); } }}
                              className={cn(
                                "grid min-h-9 min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                currentSessionId === session.id && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              )}
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center text-[10px] text-sidebar-foreground/70 tabular-nums whitespace-nowrap" aria-hidden>
                                {formatSessionTime(session.updated_at)}
                              </span>
                              <span
                                className={cn(
                                  "block truncate rounded-full px-2.5 py-1 font-medium transition-colors",
                                  currentSessionId === session.id
                                    ? "bg-sidebar-accent-foreground/12 text-sidebar-accent-foreground"
                                    : "group-hover/row:bg-gradient-to-r group-hover/row:from-[var(--primary)]/28 group-hover/row:via-[var(--accent)]/85 group-hover/row:to-[var(--accent)]/32"
                                )}
                                title={session.title || 'New conversation'}
                              >
                                {session.title || 'New conversation'}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "size-8 shrink-0 text-sidebar-foreground/70 transition-opacity hover:text-destructive",
                                  currentSessionId === session.id ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
                                )}
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
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>
              </aside>
              <ResizeHandle
                onMouseDown={historySidebar.handleMouseDown}
                isResizing={historySidebar.isResizing}
                position="right"
                className="z-10 shrink-0 bg-border/10 hover:bg-border/35"
              />
              </>
            )}

            {/* Main chat area (narrow: only this; full screen: right side) */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
              {messages.length === 0 ? (
                // --- Empty State: input at bottom; full screen = compact bar, narrow = full input card ---
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-1 flex flex-col items-center justify-center px-4">
                    <div className="relative mb-3">
                      <Notes9LoaderGif alt="Catalyst AI loader" widthPx={64} />
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
                        const isLastUserAwaitingReply =
                          isLoading &&
                          message.role === 'user' &&
                          index === messages.length - 1;
                        const isEditing = editingMessageId === message.id;
                        return (
                          <div key={message.id} className={cn('group/message flex gap-4 w-full', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                            {message.role === 'assistant' && (
                          <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-[rgba(124,82,52,0.05)] shadow-sm dark:bg-background dark:border-border">
                                <div className="relative size-[18px] shrink-0" aria-hidden>
                                  <Image
                                    src="/notes9-logo-mark-transparent.png"
                                    alt=""
                                    fill
                                    sizes="18px"
                                    className="object-contain dark:invert dark:brightness-125"
                                  />
                                </div>
                              </div>
                            )}
                            <div className={cn("flex flex-col min-w-0 max-w-[85%]", message.role === 'user' ? "items-end" : "items-start")}>
                              {isEditing ? (
                                <MessageEditor
                                  messageId={message.id}
                                  initialContent={content}
                                  setMode={(mode) => {
                                    if (mode === 'view') setEditingMessageId(null);
                                  }}
                                  onSave={handleEditMessage}
                                  compact
                                />
                              ) : (
                                <>
                                  <div className={cn("text-sm leading-[1.45] whitespace-pre-wrap break-words overflow-visible", message.role === 'user' ? "bg-primary/5 text-foreground px-4 py-2.5 rounded-2xl rounded-tr-sm" : "min-w-0 text-foreground")}>
                                    {message.role === 'user' ? content : <MarkdownRenderer content={content} className="text-sm text-foreground" />}
                                  </div>
                                  <div className="mt-1 opacity-0 group-hover/message:opacity-100 transition-opacity px-1">
                                    <MessageActions
                                      sessionId={currentSessionId}
                                      messageId={message.id}
                                      messageRole={message.role as 'user' | 'assistant'}
                                      messageContent={content}
                                      userEditDisabled={isLastUserAwaitingReply}
                                      regenerateDisabled={isLoading && isLastAssistant}
                                      onEdit={
                                        message.role === 'user'
                                          ? () => setEditingMessageId(message.id)
                                          : undefined
                                      }
                                      onRegenerate={isLastAssistant ? handleRegenerate : undefined}
                                      compact
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {agentMode === 'notes9' &&
                        (notes9Loading || agentStream.isStreaming || agentStream.error) &&
                        messages.at(-1)?.role === 'user' && (
                        <div className="flex gap-4 w-full justify-start">
                          <div className="size-7 shrink-0 flex items-center justify-center rounded-full bg-background border shadow-sm mt-1 -translate-y-[5px]">
                            <Sparkles className="size-3.5 text-primary animate-pulse" />
                          </div>
                          <div className="flex-1 min-w-0 max-w-[85%]">
                            <AgentStreamReply
                              thinkingSteps={agentStream.thinkingSteps}
                              sql={agentStream.sql}
                              ragChunks={agentStream.ragChunks}
                              streamedAnswer={agentStream.streamedAnswer}
                              donePayload={agentStream.donePayload}
                              error={agentStream.error}
                              compact
                            />
                          </div>
                        </div>
                      )}
                      {isLoading &&
                        !(notes9Loading || agentStream.isStreaming || agentStream.error) &&
                        messages.at(-1)?.role === 'user' && (
                        <div className="flex w-full justify-start">
                          <Notes9VideoLoader
                            className="max-w-[280px]"
                            compact
                            inline
                            size="sm"
                            horizontal
                            title="Generating response"
                            captions={[
                              "Working on your request.",
                              "This may take a few seconds.",
                            ]}
                            label="Generating response"
                          />
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
