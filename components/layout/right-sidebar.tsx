'use client';

import Image from 'next/image';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  BookOpen,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatNotes9AssistantMarkdown,
  isPersistedChatMessageId,
  parseNotes9AssistantStoredContent,
  notes9PlainTextForApiHistory,
} from '@/lib/notes9-chat-format';
import { formatLiteratureAssistantMarkdown } from '@/lib/literature-agent-chat-format';
import { previewFromLiteratureSseTokenBuffer } from '@/lib/literature-stream-preview';
import {
  parseLiteratureAssistantStoredContent,
  serializeLiteratureAssistantStoredContent,
} from '@/lib/literature-assistant-stored';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { usePaperAI } from '@/contexts/paper-ai-context';
import { PaperAIPanel } from '@/components/text-editor/paper-ai-panel';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { ClipboardInfoIcon } from '@/components/ui/clipboard-info-icon';
import type { CatalystAgentMode, LiteratureDragPayload } from '@/lib/catalyst-agent-types';
import {
  LITERATURE_DRAG_MIME,
  isLiteratureRoutePath,
} from '@/lib/catalyst-agent-types';
import { useLiteratureMentionCandidates } from '@/contexts/literature-mention-context';
import { useLiteratureAgentStream } from '@/hooks/use-literature-agent-stream';
import type { LiteratureAgentDonePayload } from '@/lib/literature-agent-types';
import { ClarifyCard } from '@/components/clarify-card';
import { LiteratureSourcesDropdown } from '@/components/literature-sources-dropdown';
import {
  AgentCitationsPanel,
  groundingResourceToPanelItem,
} from '@/components/catalyst/agent-citations-panel';
import {
  LiteratureAgentThinkingPanel,
  LiteratureStreamProgressHint,
} from '@/components/literature-agent-thinking-panel';
import type { LiteratureMentionCandidate } from '@/contexts/literature-mention-context';
import {
  appendLiteratureMentionAtEnd,
  clearLiteratureEditablePlainText,
  deleteLiteratureTextRange,
  getCursorOffset,
  getMentionsFromLiteratureEditable,
  getLiteratureSegmentsFromEl,
  getPlainTextFromLiteratureEditable,
  getQueryAfterAt,
  getTextBeforeCursor,
  insertLiteratureMention,
  literatureMessageMarkdownToPlainForModel,
  segmentsToLiteratureMessageMarkdown,
} from '@/lib/literature-chat-editable';

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

/** Model-facing history for literature agent: user turns strip `[title](url)` to titles only. */
function literatureHistoryTurnContent(msg: {
  role: string;
  content?: unknown;
  parts?: Array<{ type?: string; text?: string }>;
}): string {
  const raw = getPlainTextFromMessage(msg);
  if (msg.role === 'user') return literatureMessageMarkdownToPlainForModel(raw);
  return parseLiteratureAssistantStoredContent(raw).bodyMarkdown;
}

/** Notes9 agent: assistant turns omit §§NOTES9_GROUNDING§§ payload from API history. */
function notes9HistoryTurnContent(msg: {
  role: string;
  content?: unknown;
  parts?: Array<{ type?: string; text?: string }>;
}): string {
  const raw = getPlainTextFromMessage(msg);
  return notes9PlainTextForApiHistory(raw, msg.role);
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
const MAX_LITERATURE_TAGS = 4;

function sortLiteratureCandidates(
  list: LiteratureMentionCandidate[]
): LiteratureMentionCandidate[] {
  return [...list].sort((a, b) => {
    const tier = (p: string | null) => (p === 'staging' ? 0 : 1);
    const d = tier(a.catalog_placement) - tier(b.catalog_placement);
    if (d !== 0) return d;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });
}

interface RightSidebarProps {
  onClose?: () => void;
}

export function RightSidebar({ onClose }: RightSidebarProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paperAI = usePaperAI();
  const [input, setInput] = useState('');
  const [agentMode, setAgentMode] = useState<CatalystAgentMode>('general');
  const [taggedLiterature, setTaggedLiterature] = useState<Array<{ id: string; title: string }>>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  /** Todo-style @ menu: row highlight (-1 = none). */
  const [literatureMentionSelectIndex, setLiteratureMentionSelectIndex] = useState(-1);
  const [literatureMentionStartIndex, setLiteratureMentionStartIndex] = useState(-1);
  const [literaturePlainLen, setLiteraturePlainLen] = useState(0);
  const [fallbackMentionCandidates, setFallbackMentionCandidates] = useState<LiteratureMentionCandidate[]>([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(() => new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [notes9Loading, setNotes9Loading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const literatureEditableRef = useRef<HTMLDivElement>(null);
  const literatureMentionListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [chatShowJumpBottom, setChatShowJumpBottom] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isDraggingContext, setIsDraggingContext] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedHistoryOpen, setExpandedHistoryOpen] = useState(true);
  const [showAllPastChats, setShowAllPastChats] = useState(false);
  /** When set, show main Catalyst chat instead of the paper Writing panel (paper context stays registered). */
  const [paperUiSuppressed, setPaperUiSuppressed] = useState(false);
  const previousPathnameRef = useRef(pathname);
  const savedModeOutsideLiteratureRef = useRef<CatalystAgentMode>('general');
  const wasOnLiteratureRouteRef = useRef(false);
  /** When true, stay on General/Notes9 even while URL is under /literature-reviews (no redirect). */
  const suppressLiteratureAutoModeRef = useRef(false);
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

  const currentSessionRef = useRef<string | null>(null);

  const agentStream = useAgentStream();
  const literatureAgentStream = useLiteratureAgentStream();
  const contextMentionCandidates = useLiteratureMentionCandidates();
  const isLiteratureRoute = isLiteratureRoutePath(pathname ?? null);
  const isProtocolDesignRoute =
    Boolean((pathname ?? '').startsWith('/protocols/')) &&
    searchParams.get('design') === '1';
  const effectiveMentionCandidates =
    contextMentionCandidates.length > 0 ? contextMentionCandidates : fallbackMentionCandidates;

  const stagingRepoMentionCandidates = useMemo(
    () =>
      effectiveMentionCandidates.filter(
        (m) =>
          m.catalog_placement === 'staging' || m.catalog_placement === 'repository'
      ),
    [effectiveMentionCandidates]
  );

  const sortedBaseMentions = useMemo(
    () => sortLiteratureCandidates(stagingRepoMentionCandidates),
    [stagingRepoMentionCandidates]
  );

  const filteredMentionCandidates = useMemo(() => {
    const q = mentionFilter.toLowerCase().trim();
    const list = q
      ? sortedBaseMentions.filter(
          (m) =>
            m.title.toLowerCase().includes(q) ||
            (m.authors ?? '').toLowerCase().includes(q)
        )
      : sortedBaseMentions;
    return sortLiteratureCandidates(list);
  }, [sortedBaseMentions, mentionFilter]);

  const sortedTaggedLiterature = useMemo(
    () =>
      [...taggedLiterature].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      ),
    [taggedLiterature]
  );

  const finalizeLiteratureAssistant = useCallback(
    async (
      donePayload: LiteratureAgentDonePayload,
      sessionId: string,
      endpoint: 'compare' | 'biomni'
    ) => {
      const bodyMd = formatLiteratureAssistantMarkdown(donePayload, endpoint);
      const refs = donePayload.structured?.references ?? [];
      const formattedAnswer = serializeLiteratureAssistantStoredContent(bodyMd, refs);
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
      literatureAgentStream.reset();
    },
    [saveMessage, loadSessions, literatureAgentStream, setMessages]
  );

  const handleLiteratureClarifyAnswer = useCallback(
    async (answer: string) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error('Please sign in to continue');
        return;
      }
      const sid = currentSessionRef.current;
      if (!sid) return;
      const { donePayload, error, finalizeTag } = await literatureAgentStream.answerClarify(answer, token);
      if (donePayload && finalizeTag) await finalizeLiteratureAssistant(donePayload, sid, finalizeTag);
      else if (error) toast.error(error);
    },
    [supabase, literatureAgentStream, finalizeLiteratureAssistant]
  );

  const handleLiteratureClarifySkip = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      toast.error('Please sign in to continue');
      return;
    }
    const sid = currentSessionRef.current;
    if (!sid) return;
    const { donePayload, error, finalizeTag } = await literatureAgentStream.skipClarify(token);
    if (donePayload && finalizeTag) await finalizeLiteratureAssistant(donePayload, sid, finalizeTag);
    else if (error) toast.error(error);
  }, [supabase, literatureAgentStream, finalizeLiteratureAssistant]);

  /** Todo panel caps the @ list at 10 rows. */
  const menuMentionCandidates = useMemo(
    () => filteredMentionCandidates.slice(0, 10),
    [filteredMentionCandidates]
  );

  const syncTaggedFromLiteratureEditable = useCallback(() => {
    const el = literatureEditableRef.current;
    if (!el) return;
    setTaggedLiterature(getMentionsFromLiteratureEditable(el));
    setLiteraturePlainLen(getPlainTextFromLiteratureEditable(el).length);
  }, []);

  const literatureResizeInput = useCallback((reset = false) => {
    const el = literatureEditableRef.current;
    if (!el) return;
    const emptyText = !getPlainTextFromLiteratureEditable(el).trim();
    const noMentions = getMentionsFromLiteratureEditable(el).length === 0;
    if (reset || (emptyText && noMentions)) {
      el.style.minHeight = '52px';
      el.style.height = 'auto';
      return;
    }
    el.style.height = 'auto';
    el.style.minHeight = `${Math.min(el.scrollHeight, 300)}px`;
  }, []);

  useEffect(() => {
    if (literatureMentionSelectIndex >= menuMentionCandidates.length) {
      setLiteratureMentionSelectIndex(
        menuMentionCandidates.length ? menuMentionCandidates.length - 1 : -1
      );
    }
  }, [menuMentionCandidates.length, literatureMentionSelectIndex]);

  useEffect(() => {
    if (mentionOpen) setLiteratureMentionSelectIndex(-1);
  }, [mentionOpen, mentionFilter]);

  useEffect(() => {
    const el = literatureEditableRef.current;
    if (!el || agentMode !== 'literature' || !isLiteratureRoute) return;
    const onRemoved = () => syncTaggedFromLiteratureEditable();
    el.addEventListener('literature-mention-removed', onRemoved);
    return () => el.removeEventListener('literature-mention-removed', onRemoved);
  }, [agentMode, isLiteratureRoute, syncTaggedFromLiteratureEditable]);

  const showLiteratureMention =
    agentMode === 'literature' &&
    isLiteratureRoute &&
    literatureMentionStartIndex !== -1 &&
    (mentionFilter.length === 0 ||
      menuMentionCandidates.some(
        (m) =>
          m.title.toLowerCase().includes(mentionFilter.toLowerCase()) ||
          (m.authors ?? '').toLowerCase().includes(mentionFilter.toLowerCase())
      ));

  useEffect(() => {
    if (agentMode !== 'literature' || !isLiteratureRoute) {
      setMentionOpen(false);
      return;
    }
    setMentionOpen(showLiteratureMention && menuMentionCandidates.length > 0);
  }, [
    agentMode,
    isLiteratureRoute,
    showLiteratureMention,
    menuMentionCandidates.length,
  ]);

  useEffect(() => {
    if (!mentionOpen || !literatureMentionListRef.current || literatureMentionSelectIndex < 0)
      return;
    const row = literatureMentionListRef.current.querySelector(
      `[role="option"]:nth-child(${literatureMentionSelectIndex + 1})`
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [mentionOpen, literatureMentionSelectIndex]);

  useEffect(() => {
    if (!isLiteratureRoute) {
      setFallbackMentionCandidates([]);
      return;
    }
    if (contextMentionCandidates.length > 0) return;
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data, error } = await supabase
        .from('literature_reviews')
        .select('id,title,authors,catalog_placement')
        .in('catalog_placement', ['staging', 'repository'])
        .order('updated_at', { ascending: false })
        .limit(300);
      if (cancelled || error || !data) return;
      setFallbackMentionCandidates(
        data.map((row) => ({
          id: row.id,
          title: row.title ?? '',
          authors: row.authors,
          catalog_placement: row.catalog_placement ?? null,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [isLiteratureRoute, contextMentionCandidates.length, supabase]);

  useEffect(() => {
    const onLit = isLiteratureRoutePath(pathname ?? null);
    const onProtocolDesign =
      Boolean((pathname ?? '').startsWith('/protocols/')) &&
      searchParams.get('design') === '1';
    if (onLit) {
      if (!suppressLiteratureAutoModeRef.current) {
        setAgentMode('literature');
      }
      wasOnLiteratureRouteRef.current = true;
      return;
    }
    if (onProtocolDesign) {
      setAgentMode('protocol');
      return;
    }
    wasOnLiteratureRouteRef.current = false;
    suppressLiteratureAutoModeRef.current = false;
    setTaggedLiterature([]);
    setMentionOpen(false);
    literatureEditableRef.current?.replaceChildren();
    setLiteraturePlainLen(0);
    setAgentMode((m) =>
      m === 'literature' || m === 'protocol' ? savedModeOutsideLiteratureRef.current : m
    );
  }, [pathname, searchParams]);

  const applyLiteratureMentionFromMenu = useCallback(
    (pick: { id: string; title: string }) => {
      const el = literatureEditableRef.current;
      if (!el || literatureMentionStartIndex < 0) return;
      const existing = getMentionsFromLiteratureEditable(el);
      const end = getCursorOffset(el);
      if (
        !existing.some((m) => m.id === pick.id) &&
        existing.length >= MAX_LITERATURE_TAGS
      ) {
        toast.error(`You can tag at most ${MAX_LITERATURE_TAGS} papers`);
        return;
      }
      if (existing.some((m) => m.id === pick.id)) {
        deleteLiteratureTextRange(el, literatureMentionStartIndex, end);
      } else {
        insertLiteratureMention(el, pick, literatureMentionStartIndex, end);
      }
      setMentionOpen(false);
      setMentionFilter('');
      setLiteratureMentionStartIndex(-1);
      setLiteratureMentionSelectIndex(-1);
      syncTaggedFromLiteratureEditable();
      requestAnimationFrame(() => literatureResizeInput());
    },
    [literatureMentionStartIndex, syncTaggedFromLiteratureEditable, literatureResizeInput]
  );

  const addTaggedLiterature = useCallback(
    (id: string, title: string) => {
      const el = literatureEditableRef.current;
      if (!el) return;
      const ok = appendLiteratureMentionAtEnd(
        el,
        { id, title },
        MAX_LITERATURE_TAGS
      );
      if (!ok) {
        toast.error(`You can tag at most ${MAX_LITERATURE_TAGS} papers`);
        return;
      }
      syncTaggedFromLiteratureEditable();
      requestAnimationFrame(() => literatureResizeInput());
    },
    [syncTaggedFromLiteratureEditable, literatureResizeInput]
  );

  const handleNonFileDrop = useCallback(
    (e: DragEvent) => {
      if (agentMode !== 'literature' || !isLiteratureRoute) return false;
      const raw = e.dataTransfer.getData(LITERATURE_DRAG_MIME);
      if (!raw) return false;
      try {
        const p = JSON.parse(raw) as LiteratureDragPayload;
        if (p?.id && p?.title) {
          addTaggedLiterature(p.id, p.title);
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    },
    [agentMode, isLiteratureRoute, addTaggedLiterature]
  );

  const handleEscapeToNonLiteratureMode = useCallback(
    async (mode: 'general' | 'notes9') => {
      if (
        status === 'streaming' ||
        status === 'submitted' ||
        notes9Loading ||
        literatureAgentStream.isStreaming ||
        literatureAgentStream.clarify
      ) {
        toast.error('Wait for the current response to finish before switching.');
        return;
      }
      savedModeOutsideLiteratureRef.current = mode;
      const sessionId = await createSession();
      if (sessionId) {
        currentSessionRef.current = sessionId;
        setMessages([]);
        setAttachments([]);
        setSavedMessageIds(new Set());
        setTaggedLiterature([]);
        setMentionOpen(false);
        literatureEditableRef.current?.replaceChildren();
        setLiteraturePlainLen(0);
      } else {
        toast.error('Failed to start new chat session');
        return;
      }
      suppressLiteratureAutoModeRef.current = true;
      setAgentMode(mode);
      agentStream.reset();
      literatureAgentStream.reset();
    },
    [
      status,
      notes9Loading,
      literatureAgentStream,
      createSession,
      setMessages,
      agentStream,
    ]
  );

  const goToLiteratureAgent = useCallback(() => {
    suppressLiteratureAutoModeRef.current = false;
    setAgentMode('literature');
    if (!isLiteratureRoutePath(pathname ?? null)) {
      window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"));
      router.push('/literature-reviews');
    }
  }, [pathname, router]);

  const goToProtocolAgent = useCallback(() => {
    suppressLiteratureAutoModeRef.current = true;
    if (isProtocolDesignRoute) {
      setAgentMode('protocol');
      return;
    }
    toast.message('Select a protocol, then click Design to open Protocol.');
    router.push('/protocols?selectForDesign=1');
  }, [isProtocolDesignRoute, router]);

  const switchFromWritingToCatalystAgent = useCallback(
    (mode: CatalystAgentMode) => {
      setPaperUiSuppressed(true);
      if (mode === 'literature') {
        goToLiteratureAgent();
      } else if (mode === 'protocol') {
        goToProtocolAgent();
      } else {
        setAgentMode(mode);
      }
    },
    [goToLiteratureAgent, goToProtocolAgent]
  );

  useEffect(() => {
    if (!paperAI?.isActive) {
      setPaperUiSuppressed(false);
    }
  }, [paperAI?.isActive]);

  const MAX_PAST_CHATS = 5;
  const pastChatsToShow = showAllPastChats ? sessions : sessions.slice(0, MAX_PAST_CHATS);
  const hasMorePastChats = sessions.length > MAX_PAST_CHATS;

  useEffect(() => {
    currentSessionRef.current = currentSessionId;
  }, [currentSessionId]);
  const literatureAwaitingClarify =
    agentMode === 'literature' && Boolean(literatureAgentStream.clarify);

  const isLoading =
    status === 'streaming' ||
    status === 'submitted' ||
    notes9Loading ||
    literatureAgentStream.isStreaming ||
    literatureAwaitingClarify;
  const isUploading = uploadQueue.length > 0;

  const updateChatJumpBottom = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distFromBottom = scrollHeight - scrollTop - clientHeight;
    setChatShowJumpBottom(distFromBottom > 120);
  }, []);

  const onChatScroll = useCallback(() => {
    updateChatJumpBottom();
  }, [updateChatJumpBottom]);

  const scrollChatToBottom = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    const id = requestAnimationFrame(() => updateChatJumpBottom());
    return () => cancelAnimationFrame(id);
  }, [
    messages,
    agentStream.thinkingSteps,
    agentStream.streamedAnswer,
    agentStream.donePayload,
    literatureAgentStream.steps,
    literatureAgentStream.streamedAnswer,
    literatureAgentStream.upstreamActivityAt,
    literatureAgentStream.clarify,
    literatureAgentStream.isStreaming,
    notes9Loading,
    updateChatJumpBottom,
  ]);

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

  const handleFilesDrop = useCallback(async (dropFiles: File[]) => {
    const validFiles = dropFiles.filter((file) => {
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

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    resizeInput();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const litEl = literatureEditableRef.current;
    const literaturePlain =
      agentMode === 'literature' && isLiteratureRoute && litEl
        ? getPlainTextFromLiteratureEditable(litEl).trim()
        : '';
    const litIdsLive =
      agentMode === 'literature' && isLiteratureRoute && litEl
        ? getMentionsFromLiteratureEditable(litEl).map((t) => t.id)
        : [];
    const hasLiteratureTags =
      agentMode === 'literature' && isLiteratureRoute && litIdsLive.length > 0;
    const canSendLiterature =
      agentMode === 'literature' &&
      isLiteratureRoute &&
      (literaturePlain.length > 0 || hasLiteratureTags);
    if (agentMode === 'literature' && isLiteratureRoute) {
      if (!canSendLiterature || isLoading || isUploading) return;
    } else if (
      (!input.trim() && attachments.length === 0) ||
      isLoading ||
      isUploading
    ) {
      return;
    }

    const text =
      agentMode === 'literature' && isLiteratureRoute ? literaturePlain : input;
    const mentionsBefore =
      agentMode === 'literature' && isLiteratureRoute && litEl
        ? getMentionsFromLiteratureEditable(litEl)
        : [];
    const litIdsSnapshot = mentionsBefore
      .slice()
      .sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      )
      .map((m) => m.id);

    /** DOM + React state so tagged papers always reach the API even if one source is stale. */
    const literatureReviewIdsForRequest = (() => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const id of litIdsSnapshot) {
        if (id && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
      for (const t of sortedTaggedLiterature) {
        if (t.id && !seen.has(t.id)) {
          seen.add(t.id);
          out.push(t.id);
        }
      }
      return out;
    })();

    /** Must be read before clearLiteratureEditablePlainText — that call strips typed text from the composer. */
    const userLiteratureMarkdownBeforeClear =
      agentMode === 'literature' && isLiteratureRoute && litEl
        ? segmentsToLiteratureMessageMarkdown(getLiteratureSegmentsFromEl(litEl))
        : null;

    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);
    requestAnimationFrame(() => resizeInput(true));
    if (agentMode === 'literature' && isLiteratureRoute && litEl) {
      clearLiteratureEditablePlainText(litEl);
      syncTaggedFromLiteratureEditable();
      requestAnimationFrame(() => literatureResizeInput(true));
    }

    const isFirstMessageInSession = messages.length === 0;
    const firstMentionTitle = mentionsBefore[0]?.title;
    const titleFromFirst =
      text.trim().slice(0, 50) ||
      firstMentionTitle?.slice(0, 50) ||
      'New conversation';
    if (!currentSessionRef.current) {
      const sessionId = await createSession();
      if (sessionId) {
        currentSessionRef.current = sessionId;
        updateSessionTitle(sessionId, titleFromFirst);
      } else {
        toast.error("Failed to start new chat session");
        return;
      }
    } else if (isFirstMessageInSession) {
      updateSessionTitle(currentSessionRef.current, titleFromFirst);
    }

    if (agentMode === 'literature') {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error('Please sign in to use the literature agent');
        router.push('/auth/login');
        return;
      }

      const userStoredContent = userLiteratureMarkdownBeforeClear ?? text;
      const queryText =
        literatureMessageMarkdownToPlainForModel(userStoredContent).trim() ||
        (literatureReviewIdsForRequest.length > 0
          ? 'Compare and analyze the tagged papers.'
          : '');

      const userMessageId = `user-${Date.now()}`;
      const userMessage = {
        id: userMessageId,
        role: 'user' as const,
        content: userStoredContent,
        parts: [{ type: 'text' as const, text: userStoredContent }],
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      const sessionId = currentSessionRef.current!;
      const savedUser = await saveMessage(sessionId, 'user', userStoredContent);
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
        content: literatureHistoryTurnContent(m),
      }));

      const endpoint = 'compare' as const;
      const { donePayload, error } = await literatureAgentStream.runRequest(
        endpoint,
        {
          query: queryText,
          session_id: sessionId,
          history,
          literature_review_ids: literatureReviewIdsForRequest,
        },
        token
      );

      if (donePayload) {
        await finalizeLiteratureAssistant(donePayload, sessionId, endpoint);
      } else if (error) {
        toast.error(error);
      }
      return;
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
        content: notes9HistoryTurnContent(m),
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
        content:
          agentMode === 'literature'
            ? literatureHistoryTurnContent(m)
            : agentMode === 'notes9'
              ? notes9HistoryTurnContent(m)
              : getPlainTextFromMessage(m),
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

      if (agentMode === 'literature') {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          toast.error('Please sign in to use the literature agent');
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

        const litIds = sortedTaggedLiterature.map((t) => t.id);
        const endpoint = 'compare' as const;
        const queryFromEdit =
          literatureMessageMarkdownToPlainForModel(newContent).trim() ||
          (litIds.length > 0 ? 'Compare and analyze the tagged papers.' : '');
        const { donePayload, error } = await literatureAgentStream.runRequest(
          endpoint,
          {
            query: queryFromEdit,
            session_id: sid,
            history,
            literature_review_ids: litIds,
          },
          token
        );

        if (donePayload) {
          await finalizeLiteratureAssistant(donePayload, sid, endpoint);
        } else if (error) {
          toast.error(error);
        }
        return;
      }

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
    [
      messages,
      setMessages,
      regenerate,
      agentMode,
      taggedLiterature,
      supabase,
      saveMessage,
      loadSessions,
      agentStream,
      literatureAgentStream,
      finalizeLiteratureAssistant,
    ]
  );

  const handleRegenerate = useCallback(async () => {
    if (messages.length < 2) return;

    const sid = currentSessionRef.current;
    if (!sid) return;

    if (agentMode === 'literature') {
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

      const query =
        literatureMessageMarkdownToPlainForModel(getPlainTextFromMessage(lastUserMessage)).trim() ||
        (sortedTaggedLiterature.length > 0
          ? 'Compare and analyze the tagged papers.'
          : '');
      const history = messages.slice(0, lastAssistantIndex - 1).map((m) => ({
        role: m.role,
        content: literatureHistoryTurnContent(m),
      }));

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error('Please sign in to use the literature agent');
        return;
      }

      const litIds = sortedTaggedLiterature.map((t) => t.id);
      const endpoint = 'compare' as const;
      const { donePayload, error } = await literatureAgentStream.runRequest(
        endpoint,
        { query, session_id: sid, history, literature_review_ids: litIds },
        token
      );

      if (donePayload) {
        await finalizeLiteratureAssistant(donePayload, sid, endpoint);
      } else if (error) {
        toast.error(error);
      }
      return;
    }

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
        content: notes9HistoryTurnContent(m),
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
  }, [
    messages,
    regenerate,
    agentMode,
    taggedLiterature,
    supabase,
    saveMessage,
    loadSessions,
    agentStream,
    literatureAgentStream,
    finalizeLiteratureAssistant,
  ]);

  /** Stops Notes9 / literature agent or useChat streaming. */
  const handleStopRequest = useCallback(() => {
    if (notes9Loading) {
      agentStream.abort();
      agentStream.reset();
    } else if (literatureAgentStream.isStreaming) {
      literatureAgentStream.abort();
      literatureAgentStream.reset();
    } else if (literatureAgentStream.clarify) {
      literatureAgentStream.reset();
    } else {
      stop();
    }
  }, [notes9Loading, agentStream, literatureAgentStream, stop]);

  const handleLiteratureEditableKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>
  ) => {
    const el = literatureEditableRef.current;
    if (!el) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      const { startIndex } = getQueryAfterAt(getTextBeforeCursor(el));
      if (startIndex >= 0) {
        deleteLiteratureTextRange(el, startIndex, getCursorOffset(el));
        syncTaggedFromLiteratureEditable();
      }
      setMentionOpen(false);
      setMentionFilter('');
      setLiteratureMentionStartIndex(-1);
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const sel = window.getSelection();
      const anchor = sel?.anchorNode;
      const mention =
        anchor &&
        (anchor.nodeType === Node.ELEMENT_NODE
          ? (anchor as HTMLElement)
          : (anchor as HTMLElement).parentElement
        )?.closest?.('[data-literature-id]');
      if (mention && el.contains(mention)) {
        e.preventDefault();
        const range = document.createRange();
        if (e.key === 'ArrowRight') {
          const after =
            mention.nextSibling?.nextSibling ??
            mention.nextSibling ??
            mention;
          if (after.nodeType === Node.TEXT_NODE) {
            range.setStart(after, after.textContent?.length ?? 0);
          } else {
            range.setStartAfter(after);
          }
        } else {
          const before = mention.previousSibling;
          if (before?.nodeType === Node.TEXT_NODE) {
            range.setStart(before, before.textContent?.length ?? 0);
          } else if (before) {
            range.setStartAfter(before);
          } else {
            range.setStart(el, 0);
          }
        }
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
    }

    if (mentionOpen && menuMentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setLiteratureMentionSelectIndex((i) =>
          i < 0 ? 0 : Math.min(i + 1, menuMentionCandidates.length - 1)
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setLiteratureMentionSelectIndex((i) => (i <= 0 ? -1 : i - 1));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && literatureMentionSelectIndex >= 0) {
        const item = menuMentionCandidates[literatureMentionSelectIndex];
        if (item) {
          e.preventDefault();
          applyLiteratureMentionFromMenu({ id: item.id, title: item.title });
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e);
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
      setTaggedLiterature([]);
      setMentionOpen(false);
      literatureEditableRef.current?.replaceChildren();
      setLiteraturePlainLen(0);
      literatureAgentStream.reset();
      agentStream.reset();
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

  const renderCursorInput = () => {
    const canSendLiterature =
      agentMode === 'literature' &&
      isLiteratureRoute &&
      (literaturePlainLen > 0 || taggedLiterature.length > 0);
    const canSend =
      agentMode === 'literature' && isLiteratureRoute
        ? canSendLiterature
        : agentMode === 'literature' && !isLiteratureRoute
          ? input.trim().length > 0
          : input.trim().length > 0 || attachments.length > 0;

    const literatureComposer =
      agentMode === 'literature' && isLiteratureRoute ? (
        <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
          <PopoverAnchor asChild>
            <div className="w-full min-h-[68px] bg-transparent px-1">
              <div
                ref={literatureEditableRef}
                contentEditable
                suppressContentEditableWarning
                data-placeholder={`Ask about papers… Use @ to link papers (max ${MAX_LITERATURE_TAGS}), or drop rows here`}
                className="outline-none empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground min-h-[68px] w-full px-3 py-2.5 text-sm max-h-[300px] overflow-y-auto scrollbar-hide"
                onBeforeInput={(e) => {
                  const ie = e.nativeEvent as InputEvent;
                  if (!ie.inputType?.startsWith('insert')) return;
                  const ed = literatureEditableRef.current;
                  if (!ed) return;
                  if (
                    getPlainTextFromLiteratureEditable(ed).length >= MAX_CHAT_CHARS
                  ) {
                    e.preventDefault();
                  }
                }}
                onInput={() => {
                  const ed = literatureEditableRef.current;
                  if (!ed) return;
                  syncTaggedFromLiteratureEditable();
                  const textBefore = getTextBeforeCursor(ed);
                  const { query, startIndex } = getQueryAfterAt(textBefore);
                  setMentionFilter(query);
                  setLiteratureMentionStartIndex(startIndex);
                  literatureResizeInput();
                }}
                onKeyDown={handleLiteratureEditableKeyDown}
                role="textbox"
                aria-multiline
                aria-label="Literature chat message"
              />
            </div>
          </PopoverAnchor>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div
              ref={literatureMentionListRef}
              className="max-h-[200px] overflow-y-auto rounded-md"
              role="listbox"
              aria-label="Link literature papers"
            >
              {menuMentionCandidates.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No papers match. Try another search.
                </p>
              ) : (
                menuMentionCandidates.map((item, index) => {
                  const placement =
                    item.catalog_placement === 'staging' ? 'staging' : 'repository';
                  return (
                    <button
                      type="button"
                      key={item.id}
                      role="option"
                      aria-selected={
                        literatureMentionSelectIndex >= 0 &&
                        index === literatureMentionSelectIndex
                      }
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm flex items-center gap-2 rounded-sm',
                        index === literatureMentionSelectIndex
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50'
                      )}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        applyLiteratureMentionFromMenu({
                          id: item.id,
                          title: item.title,
                        });
                      }}
                    >
                      <BookOpen className="h-4 w-4 shrink-0" />
                      <span className="truncate min-w-0">{item.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">
                        {placement}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      ) : null;

    return (
    <>
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
        <FileDropzone
          onFilesDrop={handleFilesDrop}
          onNonFileDrop={handleNonFileDrop}
          accept={ALLOWED_TYPES}
          description="Drop files or literature papers to attach"
          activeClassName="ring-2 ring-primary border-primary bg-primary/5 min-h-[132px]"
        >
          {literatureComposer ?? (
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Plan, @ for context, / for commands"
              className="w-full min-h-[68px] resize-none bg-transparent px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none scrollbar-hide"
              disabled={isLoading || contextLoading}
              autoFocus
              maxLength={MAX_CHAT_CHARS}
            />
          )}
        </FileDropzone>

        <div className="mt-1 flex min-h-9 items-center justify-between gap-2 px-2 pb-2">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button id="tour-ai-mode" variant="ghost" size="sm" className="h-7 gap-1.5 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground px-2 text-xs font-medium shrink-0">
                  {agentMode === 'literature' ? (
                    <>
                      <BookOpen className="size-3.5" />
                      Literature
                    </>
                  ) : agentMode === 'protocol' ? (
                    <>
                      <ClipboardInfoIcon className="size-3.5" />
                      Protocol
                    </>
                  ) : agentMode === 'notes9' ? (
                    <>
                      <NotebookPen className="size-3.5" /> Notes9
                    </>
                  ) : (
                    <>
                      <MessageSquare className="size-3.5" /> General
                    </>
                  )}
                  <ChevronDown className="size-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px]">
                {paperAI?.isActive && paperUiSuppressed ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => setPaperUiSuppressed(false)}
                      className="gap-2 text-xs"
                    >
                      <Sparkles className="size-3.5" /> Writing
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem
                  onClick={() => {
                    goToProtocolAgent();
                  }}
                  className="gap-2 text-xs"
                >
                  <ClipboardInfoIcon className="size-3.5" /> Protocol
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    goToLiteratureAgent();
                  }}
                  className="gap-2 text-xs"
                >
                  <BookOpen className="size-3.5" /> Literature
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    isLiteratureRoute
                      ? void handleEscapeToNonLiteratureMode('general')
                      : (savedModeOutsideLiteratureRef.current = 'general', setAgentMode('general'))
                  }
                  className={cn(
                    'gap-2 text-xs',
                    isLiteratureRoute && 'opacity-60 text-muted-foreground'
                  )}
                >
                  <MessageSquare className="size-3.5" /> General
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    isLiteratureRoute
                      ? void handleEscapeToNonLiteratureMode('notes9')
                      : (savedModeOutsideLiteratureRef.current = 'notes9', setAgentMode('notes9'))
                  }
                  className={cn(
                    'gap-2 text-xs',
                    isLiteratureRoute && 'opacity-60 text-muted-foreground'
                  )}
                >
                  <NotebookPen className="size-3.5" /> Notes9
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {agentMode === 'general' && (
              <div className="ml-1 flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-border/50 pl-2">
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Web Search</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Switch
                  checked={webSearchEnabled}
                  onCheckedChange={setWebSearchEnabled}
                  disabled={isLoading}
                  className="shrink-0 scale-90"
                  aria-label="Web search"
                />
              </div>
            )}
          </div>

          <div className="flex h-9 shrink-0 items-center justify-end gap-1">
            <span className="mr-1 hidden text-[11px] text-muted-foreground sm:inline">
              {agentMode === 'literature' && isLiteratureRoute
                ? literaturePlainLen
                : input.length}
              /{MAX_CHAT_CHARS}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || agentMode === 'literature'}
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
                  canSend && "text-primary",
                )}
                onClick={(e) => void handleSubmit(e as React.FormEvent)}
                disabled={!canSend || isUploading}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
    );
  };

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

  const showLiteratureEmptyState = agentMode === 'literature' && isLiteratureRoute;
  const emptyStateSubheading = showLiteratureEmptyState ? 'For Literature' : null;
  const emptyStateDescription = showLiteratureEmptyState
    ? 'Ask about papers, compare findings, and cross-check cited source passages. Use @ to link papers or drop literature rows into the composer.'
    : 'Your intelligent research assistant. Ask anything about your lab notes, experiments, or protocols.';

  return (
    <div className={cn(
      "flex flex-col bg-background border-l border-border/45 min-h-0 overflow-hidden shadow-[-2px_0_18px_-16px_rgba(44,36,24,0.22)] dark:shadow-[-2px_0_18px_-16px_rgba(0,0,0,0.45)]",
      isExpanded
        ? "fixed top-0 right-0 bottom-0 left-[var(--sidebar-width,0px)] z-[120] w-auto h-full transition-none"
        : "h-full w-full min-w-0 transition-none"
    )}>
      {/* Hidden File Input */}
      <input ref={fileInputRef} type="file" multiple accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={handleFileSelect} disabled={isLoading || isUploading} />

      {!mounted ? (
        <div className="flex flex-1 items-center justify-center">
          <Sparkles className="size-6 -translate-y-[5px] text-muted-foreground/50 animate-pulse" />
        </div>
      ) : paperAI?.isActive && !paperUiSuppressed ? (
        <PaperAIPanel
          open
          embedded
          onClose={() => onClose?.()}
          getContent={paperAI.getContent}
          onInsert={paperAI.onInsert}
          paperTitle={paperAI.paperTitle}
          paperId={paperAI.paperId}
          getEditorContext={paperAI.getEditorContext}
          onSwitchToCatalystAgent={switchFromWritingToCatalystAgent}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded((v) => !v)}
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
                                  <div
                                    key={session.id}
                                    className="group/row relative"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => loadSession(session.id)}
                                      className={cn(
                                        "flex min-w-max max-w-full items-center justify-between gap-2 overflow-hidden rounded-md px-2 py-1.5 pr-12 text-left text-sm transition-all duration-150 hover:bg-[color:color-mix(in_oklab,var(--background)_78%,var(--primary)_22%)] hover:text-sidebar-foreground active:scale-[0.985] active:bg-[color:color-mix(in_oklab,var(--background)_70%,var(--primary)_30%)] dark:hover:bg-sidebar-accent dark:hover:text-sidebar-accent-foreground dark:active:scale-[0.985] dark:active:bg-sidebar-accent/90",
                                        currentSessionId === session.id
                                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                          : "text-sidebar-foreground/70"
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "block truncate whitespace-nowrap font-medium",
                                          currentSessionId === session.id
                                            ? "text-sidebar-accent-foreground"
                                            : "text-inherit"
                                        )}
                                        title={session.title || 'New conversation'}
                                      >
                                        {session.title || 'New conversation'}
                                      </span>
                                      <span className="shrink-0 text-[10px] text-sidebar-foreground/70 opacity-70">
                                        {new Date(session.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                      </span>
                                    </button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        "absolute right-1 top-1/2 z-10 h-7 w-7 -translate-y-1/2 rounded-full border border-border/35 bg-background/82 text-sidebar-foreground/70 shadow-sm backdrop-blur-md transition-[opacity,transform,background-color,color] duration-200 ease-out hover:bg-background hover:text-destructive",
                                        currentSessionId === session.id ? "opacity-100" : "pointer-events-none translate-x-1 opacity-0 group-hover/row:pointer-events-auto group-hover/row:translate-x-0 group-hover/row:opacity-100"
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
                          <li
                            key={session.id}
                            className="group/row relative"
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => loadSession(session.id)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadSession(session.id); } }}
                              className={cn(
                                "grid min-h-9 min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-all duration-150 hover:bg-[color:color-mix(in_oklab,var(--background)_78%,var(--primary)_22%)] hover:text-sidebar-foreground active:scale-[0.985] active:bg-[color:color-mix(in_oklab,var(--background)_70%,var(--primary)_30%)] dark:hover:bg-sidebar-accent dark:hover:text-sidebar-accent-foreground dark:active:scale-[0.985] dark:active:bg-sidebar-accent/90",
                                currentSessionId === session.id && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              )}
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center text-[10px] text-sidebar-foreground/70 tabular-nums whitespace-nowrap" aria-hidden>
                                {formatSessionTime(session.updated_at)}
                              </span>
                              <span
                                className={cn(
                                  "block truncate font-medium",
                                  currentSessionId === session.id
                                    ? "text-sidebar-accent-foreground"
                                    : "text-inherit"
                                )}
                                title={session.title || 'New conversation'}
                              >
                                {session.title || 'New conversation'}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "size-8 shrink-0 text-sidebar-foreground/70 transition-[opacity,transform,color] duration-200 ease-out hover:text-destructive",
                                  currentSessionId === session.id ? "opacity-100" : "pointer-events-none translate-x-1 opacity-0 group-hover/row:pointer-events-auto group-hover/row:translate-x-0 group-hover/row:opacity-100"
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
                    {emptyStateSubheading ? (
                      <h3 className="text-sm font-semibold tracking-tight bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-transparent">
                        {emptyStateSubheading}
                      </h3>
                    ) : null}
                    <p className="text-muted-foreground text-center max-w-xs text-sm">
                      {emptyStateDescription}
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
                  {/* Messages Area — native scroll so we can detect position (ScrollArea viewport is not exposed) */}
                  <div
                    ref={chatScrollRef}
                    className="flex-1 min-h-0 basis-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
                    onScroll={onChatScroll}
                    role="log"
                    aria-label="Chat messages"
                  >
                    <div className="flex flex-col gap-6 p-4 pt-5 pb-4 max-w-3xl mx-auto w-full min-w-0">
                      {messages.map((message, index) => {
                        const rawContent = getMessageContent(message);
                        const literatureParsed =
                          message.role === 'assistant'
                            ? parseLiteratureAssistantStoredContent(rawContent)
                            : null;
                        const hasLitRefs = Boolean(
                          literatureParsed && literatureParsed.refs.length > 0
                        );
                        const notes9Parsed =
                          message.role === 'assistant' && !hasLitRefs
                            ? parseNotes9AssistantStoredContent(
                                literatureParsed?.bodyMarkdown ?? rawContent
                              )
                            : null;
                        const content = hasLitRefs
                          ? literatureParsed!.bodyMarkdown
                          : notes9Parsed
                            ? notes9Parsed.bodyMarkdown
                            : rawContent;
                        const literatureSources = hasLitRefs
                          ? literatureParsed!.refs
                          : null;
                        const notes9Sources =
                          notes9Parsed && notes9Parsed.resources.length > 0
                            ? notes9Parsed.resources
                            : null;
                        const userLiteratureMarkdown =
                          message.role === 'user' &&
                          ((agentMode === 'literature' && isLiteratureRoute) ||
                            /\]\(\/literature-reviews\//.test(content));
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
                                  <div
                                    className={cn(
                                      'text-sm leading-[1.45] break-words',
                                      message.role === 'user'
                                        ? 'whitespace-pre-wrap bg-primary/5 text-foreground px-4 py-2.5 rounded-2xl rounded-tr-sm'
                                        : 'min-w-0 text-foreground whitespace-normal'
                                    )}
                                  >
                                    {message.role === 'user' ? (
                                      userLiteratureMarkdown ? (
                                        <MarkdownRenderer
                                          content={content}
                                          className="text-sm text-foreground break-words [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:whitespace-pre [&_code]:break-all"
                                        />
                                      ) : (
                                        content
                                      )
                                    ) : (
                                      <MarkdownRenderer
                                        content={content}
                                        className="text-sm text-foreground break-words [overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:whitespace-pre [&_code]:break-all"
                                      />
                                    )}
                                  </div>
                                  {literatureSources && (
                                    <LiteratureSourcesDropdown
                                      refs={literatureSources}
                                      className="mt-2 self-start"
                                    />
                                  )}
                                  {notes9Sources && (
                                    <AgentCitationsPanel
                                      items={notes9Sources.map((c, i) =>
                                        groundingResourceToPanelItem(c, i)
                                      )}
                                      triggerLabel="All citations"
                                      className="mt-2 self-start"
                                    />
                                  )}
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
                      {agentMode === 'literature' &&
                        literatureAgentStream.isStreaming &&
                        messages.at(-1)?.role === 'user' && (
                        <div className="flex w-full gap-4 justify-start">
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
                          <div className="flex min-w-0 flex-1 flex-col gap-2 max-w-[85%]">
                            <div className="space-y-0.5">
                              <p className="text-sm font-semibold leading-tight text-foreground">
                                Literature agent
                              </p>
                              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Loader2
                                  className="size-3 shrink-0 animate-spin text-primary/70"
                                  aria-hidden
                                />
                                Working on your papers…
                              </p>
                              <LiteratureStreamProgressHint
                                isStreaming={literatureAgentStream.isStreaming}
                                upstreamActivityAt={literatureAgentStream.upstreamActivityAt}
                              />
                            </div>
                            <LiteratureAgentThinkingPanel steps={literatureAgentStream.steps} />
                            {(() => {
                              const livePreview = previewFromLiteratureSseTokenBuffer(
                                literatureAgentStream.streamedAnswer,
                                'compare'
                              );
                              if (livePreview.kind === 'empty') return null;
                              if (livePreview.kind === 'waiting_structured') {
                                return (
                                  <p className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground dark:bg-muted/10">
                                    Receiving structured answer…
                                  </p>
                                );
                              }
                              return (
                                <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 dark:bg-muted/10">
                                  {/*
                                    Live tokens: plain text only. Full MarkdownRenderer (remark/rehype/highlight)
                                    on every chunk blocks the main thread so nothing paints until the stream ends.
                                    Final formatted markdown appears in the saved assistant message.
                                  */}
                                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                                    {livePreview.markdown}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      {literatureAwaitingClarify &&
                        messages.at(-1)?.role === 'user' &&
                        literatureAgentStream.clarify && (
                        <div className="flex w-full justify-start pl-10 sm:pl-14">
                          <ClarifyCard
                            question={literatureAgentStream.clarify.question}
                            options={literatureAgentStream.clarify.options}
                            onAnswer={handleLiteratureClarifyAnswer}
                            onSkip={handleLiteratureClarifySkip}
                          />
                        </div>
                      )}
                      {agentMode === 'notes9' &&
                        messages.at(-1)?.role === 'user' &&
                        (notes9Loading ||
                          agentStream.isStreaming ||
                          agentStream.error != null ||
                          agentStream.donePayload != null) && (
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
                              isThinkingStreaming={agentStream.isStreaming}
                            />
                          </div>
                        </div>
                      )}
                      {isLoading &&
                        !(notes9Loading || agentStream.isStreaming || agentStream.error) &&
                        !(agentMode === 'literature' && literatureAgentStream.isStreaming) &&
                        !literatureAwaitingClarify &&
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
                      <div ref={messagesEndRef} className="h-2 shrink-0" aria-hidden />
                    </div>
                  </div>
                  {chatShowJumpBottom && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute bottom-[7.25rem] right-4 z-30 h-9 w-9 rounded-full border border-border/60 bg-background/95 shadow-md backdrop-blur-sm hover:bg-muted"
                      onClick={scrollChatToBottom}
                      aria-label="Scroll to latest message"
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  )}

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
