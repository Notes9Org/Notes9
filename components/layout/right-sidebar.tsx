'use client';

import Image from 'next/image';
import {
  memo,
  Fragment,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
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
  Square,
  ArrowUp,
  History,
  Maximize,
  Minimize,
  PanelLeft,
  Plus,
  Paperclip,
  Globe,
  MessageSquare,
  NotebookPen,
  PenBox,
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  Check,
  ChevronRight,
  Folder,
  FolderPlus,
  FolderInput,
  CheckSquare,
  Trash2,
  ChevronDown,
  X,
  Telescope,
  Menu,
  Sun,
  Moon,
  CircleHelp,
  Mic,
  BookOpen,
  FlaskConical,
  FolderOpen,
  FileText,
  Loader2,
  AtSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatNotes9AssistantMarkdown,
  isPersistedChatMessageId,
  parseNotes9AssistantStoredContent,
  notes9PlainTextForApiHistory,
} from '@/lib/notes9-chat-format';
import type { DonePayload } from '@/lib/agent-stream-types';
import { ChatMessage } from '@/components/catalyst/chat-message';
import { formatLiteratureAssistantMarkdown } from '@/lib/literature-agent-chat-format';
import { previewFromLiteratureSseTokenBuffer } from '@/lib/literature-stream-preview';
import {
  parseLiteratureAssistantStoredContent,
  serializeLiteratureAssistantStoredContent,
} from '@/lib/literature-assistant-stored';
import { useAgentStream, type AgentFileAttachment, type CitationsManifest, type CitationsManifestEntry, type AgentGraph } from '@/hooks/use-agent-stream';
import { useResolvedCitationTitles, type ResolvableCite } from '@/hooks/use-resolved-citation-titles';
import { isPlaceholderTitle } from '@/lib/citation-title';
import { AgentGraphList } from '@/components/catalyst/agent-graph-view';
import { usePinnedAutoScroll } from '@/hooks/use-pinned-auto-scroll';
import { deleteTrailingMessages } from '@/app/(app)/catalyst/actions';
import { MessageEditor } from '@/components/catalyst/message-editor';
import { AgentStreamReply } from '@/components/catalyst/agent-stream-reply';
import { useChatSessions, ChatSession } from '@/hooks/use-chat-sessions';
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer';
import { Notes9ChatLoader, toolCardsProgress } from '@/components/catalyst/notes9-chat-loader';
import { PreviewAttachment, type Attachment } from '@/components/catalyst/preview-attachment';
import { MessageActions } from '@/components/catalyst/message-actions';
import { IceMascot } from '@/components/ui/ice-mascot';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthUser } from "@/components/auth/auth-provider"
import { useResizable } from '@/hooks/use-resizable';
import { ResizeHandle } from '@/components/ui/resize-handle';
import { useSidebar } from '@/components/ui/sidebar';
import { useTheme } from 'next-themes';
import { requestPageHelp } from '@/components/tour/app-tour';
import { ReportIssueDialog } from '@/components/layout/report-issue-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
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
import {
  CATALYST_MENTION_DRAG_MIME,
  type CatalystMentionDragPayload,
  type CatalystMentionKind,
  catalystMentionPath,
} from '@/lib/catalyst-mention-types';
import { isLikelyUuid } from '@/lib/url-project-param';
import type { CatalystLaunchDetail, CatalystAttachDetail } from '@/lib/catalyst-launch';
import {
  CATALYST_ATTACH_EVENT,
  openCatalystPanel,
  setCatalystOrigin,
  getCatalystOrigin,
} from '@/lib/catalyst-launch';
import {
  getCatalystCoPilot,
  clearCatalystCoPilot,
  buildCoPilotPreamble,
  CATALYST_COPILOT_EVENT,
  type CoPilotContext,
} from '@/lib/catalyst-copilot';
import { useCatalystLiterature, setCatalystLiterature, type CatalystLiterature } from '@/lib/catalyst-literature';
import { literatureContextToSystemMessage, type LiteratureSessionContext } from '@/lib/literature-citations';
import { MotionReveal, MotionList, MotionItem } from '@/components/literature-reviews/motion';
import { useLiteratureMentionCandidates } from '@/contexts/literature-mention-context';
import { useLiteratureAgentStream } from '@/hooks/use-literature-agent-stream';
import type { LiteratureAgentDonePayload } from '@/lib/literature-agent-types';
import { ClarifyCard } from '@/components/clarify-card';
import { CatalystSources, litRefsToSourceItems } from '@/components/catalyst/catalyst-sources';
import {
  AgentCitationsPanel,
  groundingResourceToPanelItem,
} from '@/components/catalyst/agent-citations-panel';
import { PersistedArtifactList } from '@/components/catalyst/agent-artifact-card';
import { toPersistedArtifacts, type PersistedArtifact } from '@/lib/agent-artifacts';
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
import { useAwsTranscribe } from '@/hooks/use-aws-transcribe';
import { VoiceWaveform } from '@/components/text-editor/voice-waveform';

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
  const plain = notes9PlainTextForApiHistory(raw, msg.role);
  if (msg.role !== 'user') return plain;
  return plain.replace(
    /\[((?:\\.|[^\]])+)\]\(\/(?:literature-reviews|lab-notes|experiments|projects|protocols)\/[0-9a-z-]+\)/gi,
    '$1'
  );
}

function serializeComposerToUserMarkdown(el: HTMLDivElement | null): string {
  if (!el) return '';
  const parts: string[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as HTMLElement;
      const id = e.getAttribute('data-caty-tag-id');
      const kind = e.getAttribute('data-caty-tag-kind') as CatalystMentionKind | null;
      const title = e.getAttribute('data-caty-tag-title');
      if (id && kind && title) {
        parts.push(`[${title}](${catalystMentionPath(kind, id)})`);
      } else {
        parts.push(e.textContent ?? '');
      }
    }
  }
  return parts
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Plain text the user actually typed into the Catalyst composer, EXCLUDING
 * mention-chip text. Chips are non-editable spans carrying data-caty-tag-id/
 * -kind/-title; their titles must never leak into the submitted message (the
 * tags travel via selectedMentions / requestTags instead). Using innerText here
 * would re-introduce the dragged paper title into the chat input.
 */
function getCatalystComposerPlainText(el: HTMLDivElement | null): string {
  if (!el) return '';
  return Array.from(el.childNodes)
    .filter((n) => !(n.nodeType === Node.ELEMENT_NODE && (n as Element).hasAttribute('data-caty-tag-id')))
    .map((n) => n.textContent ?? '')
    .join('');
}

type UserComposerSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; kind: CatalystMentionKind; id: string; title: string };

const USER_COMPOSER_MENTION_PATTERN =
  /\[((?:\\.|[^\]])+)\]\(\/(literature-reviews|lab-notes|experiments|projects|protocols)\/([0-9a-z-]+)\)/gi;

function parseUserComposerSegments(markdown: string): UserComposerSegment[] {
  const out: UserComposerSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  USER_COMPOSER_MENTION_PATTERN.lastIndex = 0;
  while ((match = USER_COMPOSER_MENTION_PATTERN.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      out.push({
        type: 'text',
        text: markdown.slice(lastIndex, match.index),
      });
    }
    const title = match[1]?.replace(/\\([\[\]\\])/g, '$1') ?? '';
    const route = match[2];
    const id = match[3] ?? '';
    const kind: CatalystMentionKind =
      route === 'literature-reviews'
        ? 'literature_review'
        : route === 'lab-notes'
          ? 'lab_note'
          : route === 'experiments'
            ? 'experiment'
            : route === 'projects'
              ? 'project'
              : 'protocol';
    out.push({ type: 'mention', kind, id, title });
    lastIndex = USER_COMPOSER_MENTION_PATTERN.lastIndex;
  }
  if (lastIndex < markdown.length) {
    out.push({
      type: 'text',
      text: markdown.slice(lastIndex),
    });
  }
  return out;
}

function hasUserComposerMentions(markdown: string): boolean {
  USER_COMPOSER_MENTION_PATTERN.lastIndex = 0;
  return USER_COMPOSER_MENTION_PATTERN.test(markdown);
}

function UserMessageComposerPreview({ content }: { content: string }) {
  const segments = useMemo(() => parseUserComposerSegments(content), [content]);
  return (
    <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {segments.map((segment, idx) => {
        if (segment.type === 'text') {
          return <span key={`text-${idx}`}>{segment.text}</span>;
        }
        const iconClass = 'h-3.5 w-3.5 shrink-0 text-muted-foreground';
        return (
          <span
            key={`mention-${segment.kind}-${segment.id}-${idx}`}
            className="mx-0.5 inline-flex max-w-[24rem] items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground align-middle"
          >
            {segment.kind === 'literature_review' ? (
              <BookOpen className={iconClass} />
            ) : segment.kind === 'lab_note' ? (
              <NotebookPen className={iconClass} />
            ) : segment.kind === 'experiment' ? (
              <FlaskConical className={iconClass} />
            ) : segment.kind === 'project' ? (
              <FolderOpen className={iconClass} />
            ) : (
              <ClipboardInfoIcon className={iconClass} />
            )}
            <span className="truncate">{segment.title}</span>
          </span>
        );
      })}
    </div>
  );
}

function extractTagItemsFromMarkdown(markdown: string): Array<{
  kind: CatalystMentionKind;
  id: string;
  title: string;
}> {
  const out: Array<{ kind: CatalystMentionKind; id: string; title: string }> = [];
  const pattern =
    /\[((?:\\.|[^\]])+)\]\(\/(literature-reviews|lab-notes|experiments|projects|protocols)\/([0-9a-z-]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(markdown)) !== null) {
    const title = m[1]?.replace(/\\([\[\]\\])/g, '$1') ?? '';
    const route = m[2];
    const id = m[3];
    const kind: CatalystMentionKind =
      route === 'literature-reviews'
        ? 'literature_review'
        : route === 'lab-notes'
          ? 'lab_note'
          : route === 'experiments'
            ? 'experiment'
            : route === 'projects'
              ? 'project'
              : 'protocol';
    out.push({ kind, id, title });
  }
  return out;
}

function mergeUniqueTags(
  a: Array<{ kind: CatalystMentionKind; id: string; title: string }>,
  b: Array<{ kind: CatalystMentionKind; id: string; title: string }>
): Array<{ kind: CatalystMentionKind; id: string; title: string }> {
  const map = new Map<string, { kind: CatalystMentionKind; id: string; title: string }>();
  for (const t of [...a, ...b]) {
    map.set(`${t.kind}:${t.id}`, t);
  }
  return Array.from(map.values());
}

// Module-level stale-while-revalidate cache for the @-mention catalog.
// The right sidebar mounts on nearly every page navigation; without this,
// `loadMentionItems` would re-fire 5 parallel `.from()` queries on each mount.
// We reuse the last result for MENTION_ITEMS_TTL_MS so repeated navigations
// hold zero DB connections for the mention catalog. The data is identical
// across mounts (same org-scoped lists), so behavior is unchanged.
type MentionItem = { kind: CatalystMentionKind; id: string; title: string };
// Lazily-populated cache of the static SVG markup for each mention-chip icon.
// The icons are constant, so we render each kind once and reuse the string on
// every subsequent chip insertion (see mentionIconMarkup).
const MENTION_ICON_MARKUP_CACHE: Partial<Record<CatalystMentionKind, string>> = {};
const MENTION_ITEMS_TTL_MS = 60_000;
let mentionItemsCache: { fetchedAt: number; items: MentionItem[] } | null = null;
let mentionItemsInflight: Promise<MentionItem[]> | null = null;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Kept in sync with the backend allowlist (agents/contracts/request.py).
// Images + PDF go to the model natively; CSV/XLSX/DOCX are parsed to text
// server-side. text/plain is omitted (the backend does not support it).
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];
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

// ---------------------------------------------------------------------------
// Module-level helpers — pure functions hoisted out of RightSidebar so the
// SidebarChatMessageItem memo'd component can close over them without
// re-creating its own definition on every parent render.
// ---------------------------------------------------------------------------

/** If string is stringified JSON parts (single or double/triple wrapped),
 *  unwrap to plain text. Never return raw JSON. */
function sidebarNormalizeContentString(raw: string): string {
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

/** Extract plain text from a sidebar chat message object. */
function sidebarGetMessageContent(message: UIMessage): string {
  let raw = '';
  const content = (message as { content?: unknown }).content;
  if (content != null && Array.isArray(content)) {
    raw = (content as Array<{ type?: string; text?: string }>)
      .filter((p) => p?.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text!)
      .join('');
  }
  if (!raw && message.parts?.length) {
    raw = message.parts
      .filter((p) => p.type === 'text')
      .map((p) => ('text' in p ? String((p as { text?: unknown }).text ?? '') : ''))
      .join('');
  }
  if (!raw && content != null && typeof content === 'string') {
    raw = content;
  }
  if (!raw) return '';
  return sidebarNormalizeContentString(raw);
}

// ---------------------------------------------------------------------------
// Memoized per-message render unit for the right-sidebar message list.
// Only the actively streaming message (the last one) re-renders on each token;
// all settled history messages skip re-render because their props are stable.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// LiteratureSummaryInline — replaces LiteratureSummaryPanel as the render path
// for the live literature search AI summary.  Renders with the same ChatMessage
// component used in the chat so the summary gets [N] chips and the "All
// citations" panel (C4).  "Continue in Catalyst" button opens the persisted
// session so follow-up questions are grounded by the literature context (C3/C7).
// ---------------------------------------------------------------------------
interface LiteratureSummaryInlineProps {
  lit: CatalystLiterature;
  sessionId: string | null | undefined;
  onContinue: (sessionId: string) => void;
}

function LiteratureSummaryInline({ lit, sessionId, onContinue }: LiteratureSummaryInlineProps) {
  return (
    <MotionReveal className="glass-panel w-full min-w-0 space-y-3 rounded-xl p-3">
      {/* Header: accent dot + "AI summary" label + streaming pulse */}
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2 shrink-0" aria-hidden>
            {lit.streaming && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--n9-accent)] opacity-60" />
            )}
            <span className="relative inline-flex size-2 rounded-full bg-[var(--n9-accent)]" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--n9-accent)]">
            AI summary
          </span>
          {lit.streaming && (
            <span className="text-[11px] font-medium text-muted-foreground animate-pulse">
              composing…
            </span>
          )}
        </div>
        {lit.query && (
          <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground [overflow-wrap:anywhere]">
            {lit.query}
          </h3>
        )}
      </div>
      {/* Content: unified ChatMessage so [N] chips and citations panel work */}
      <ChatMessage
        role="assistant"
        content={lit.summary}
        citationsManifest={lit.manifest ?? null}
        sources={(lit.resources ?? []) as unknown as Array<Record<string, unknown>>}
        isStreaming={lit.streaming}
      />
    </MotionReveal>
  );
}

interface SidebarChatMessageItemProps {
  message: UIMessage;
  /** Pre-extracted plain-text content — stable string for settled messages. */
  rawContent: string;
  /** Attachment list for this message id (stable Map entry for settled msgs). */
  messageAttachments?: Attachment[];
  /**
   * True only for the final message in the list.
   * False for all history entries → stable for those entries during streaming.
   */
  isLast: boolean;
  /** True while the last user message is waiting for a reply (isLoading && isLast && role==='user'). */
  isLastUserAwaitingReply: boolean;
  /** True while isLoading && isLast && role==='assistant'. Passed pre-computed so settled messages never re-render when isLoading flips. */
  regenerateDisabled: boolean;
  /** Whether this message is currently being edited. */
  isEditing: boolean;
  agentMode: CatalystAgentMode;
  isLiteratureRoute: boolean;
  currentSessionId: string | null;
  onSetEditingMessageId: (id: string | null) => void;
  onSaveEdit: (messageId: string, newContent: string) => Promise<void>;
  onRegenerate: (() => Promise<void>) | undefined;
}

const SidebarChatMessageItem = memo(function SidebarChatMessageItem({
  message,
  rawContent,
  messageAttachments,
  isLast,
  isLastUserAwaitingReply,
  regenerateDisabled,
  isEditing,
  agentMode,
  isLiteratureRoute,
  currentSessionId,
  onSetEditingMessageId,
  onSaveEdit,
  onRegenerate,
}: SidebarChatMessageItemProps) {
  // All derivations are pure functions of rawContent / message — stable for
  // settled messages because rawContent (a string) doesn't change.
  const literatureParsed =
    message.role === 'assistant'
      ? parseLiteratureAssistantStoredContent(rawContent)
      : null;
  const hasLitRefs = Boolean(literatureParsed && literatureParsed.refs.length > 0);
  const notes9Parsed =
    message.role === 'assistant' && !hasLitRefs
      ? parseNotes9AssistantStoredContent(literatureParsed?.bodyMarkdown ?? rawContent)
      : null;

  const messageArtifacts: PersistedArtifact[] =
    (message as { metadata?: { artifacts?: PersistedArtifact[] } }).metadata?.artifacts
    ?? notes9Parsed?.artifacts
    ?? [];
  const messageGraphs: AgentGraph[] =
    (message as { metadata?: { graphs?: AgentGraph[] } }).metadata?.graphs ?? [];

  const content = hasLitRefs
    ? literatureParsed!.bodyMarkdown
    : notes9Parsed
      ? notes9Parsed.bodyMarkdown
      : rawContent;

  const literatureSources = hasLitRefs ? literatureParsed!.refs : null;

  const notes9Sources = (() => {
    if (!notes9Parsed || notes9Parsed.resources.length === 0) return null;
    const body = notes9Parsed.bodyMarkdown;
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cited = notes9Parsed.resources.filter((r, i) => {
      const label =
        typeof r.cite_label === 'string' && r.cite_label.trim()
          ? r.cite_label.trim()
          : String(i + 1);
      const base = label.split('.')[0];
      return (
        new RegExp(`\\[${escapeRe(base)}(?:\\.\\d+)?\\]`).test(body) ||
        body.includes(`[${label}]`)
      );
    });
    return cited.length > 0 ? cited : null;
  })();

  // Resolve the REAL titles for this message's citations once, then inject them
  // into BOTH the inline chips (manifest) and the Sources list, so workspace
  // records (lab notes, protocols, literature articles, papers, reports) show
  // their document title instead of "Untitled …".
  const baseManifest =
    notes9Parsed?.citationsManifest ?? literatureParsed?.citationsManifest ?? null;
  const citeRefs = useMemo<ResolvableCite[]>(() => {
    const out: ResolvableCite[] = [];
    if (notes9Sources) {
      for (const r of notes9Sources) {
        out.push({
          sourceType: r.source_type,
          sourceId: r.source_id ?? null,
          sourceUrl: r.source_url ?? null,
          currentTitle: r.source_name ?? r.display_label ?? null,
        });
      }
    }
    if (baseManifest?.manifest) {
      for (const e of Object.values(baseManifest.manifest)) {
        out.push({
          sourceType: e.source_type,
          sourceId: e.source_id ?? null,
          sourceUrl: e.source_url ?? null,
          currentTitle: e.source_name ?? null,
        });
      }
    }
    return out;
  }, [notes9Sources, baseManifest]);
  const resolveTitle = useResolvedCitationTitles(citeRefs);

  const effectiveManifest = useMemo<CitationsManifest | null>(() => {
    if (!baseManifest?.manifest) return baseManifest;
    let changed = false;
    const manifest: Record<string, CitationsManifestEntry> = {};
    for (const [k, e] of Object.entries(baseManifest.manifest)) {
      const better = isPlaceholderTitle(e.source_name, e.source_type)
        ? resolveTitle(e.source_type, e.source_id, e.source_url)
        : null;
      if (better) {
        manifest[k] = { ...e, source_name: better };
        changed = true;
      } else {
        manifest[k] = e;
      }
    }
    return changed ? { ...baseManifest, manifest } : baseManifest;
  }, [baseManifest, resolveTitle]);

  const effectiveNotes9Sources = useMemo(() => {
    if (!notes9Sources) return null;
    let changed = false;
    const out = notes9Sources.map((r) => {
      const cur = r.source_name ?? r.display_label ?? null;
      const better = isPlaceholderTitle(cur, r.source_type)
        ? resolveTitle(r.source_type, r.source_id, r.source_url)
        : null;
      if (better) {
        changed = true;
        return { ...r, source_name: better };
      }
      return r;
    });
    return changed ? out : notes9Sources;
  }, [notes9Sources, resolveTitle]);

  const userLiteratureMarkdown =
    message.role === 'user' &&
    ((agentMode === 'literature' && isLiteratureRoute) ||
      /\]\(\/(?:literature-reviews|lab-notes|experiments|projects|protocols)\//.test(content));

  const isLastAssistant = isLast && message.role === 'assistant';

  return (
    <div
      className={cn('group/message flex gap-4 w-full', message.role === 'user' ? 'justify-end' : 'justify-start')}
    >
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
      <div className={cn('flex flex-col min-w-0', message.role === 'user' ? 'items-end max-w-[85%]' : 'items-start w-full max-w-full')}>
        {isEditing ? (
          <MessageEditor
            messageId={message.id}
            initialContent={content}
            setMode={(mode) => {
              if (mode === 'view') onSetEditingMessageId(null);
            }}
            onSave={onSaveEdit}
            compact
          />
        ) : (
          <>
            {/* Image thumbnails for user messages */}
            {message.role === 'user' && (() => {
              const atts = messageAttachments;
              if (!atts?.length) return null;
              return (
                <div className="flex flex-wrap gap-2 justify-end mb-1.5">
                  {atts.map((att, i) =>
                    att.contentType?.startsWith('image/') ? (
                      <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-border/40 shadow-sm hover:opacity-90 transition-opacity">
                        <img src={att.url} alt={att.name} className="max-h-44 max-w-[260px] object-cover rounded-xl" />
                      </a>
                    ) : (
                      <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 transition-colors max-w-[180px]" title={att.name}>
                        <FileText className="size-3 shrink-0" />
                        <span className="truncate">{att.name}</span>
                      </a>
                    )
                  )}
                </div>
              );
            })()}
            <div
              className={cn(
                'text-sm leading-[1.45] break-words',
                message.role === 'user'
                  ? 'whitespace-pre-wrap bg-primary/5 text-foreground px-4 py-2.5 rounded-2xl rounded-tr-sm'
                  : 'min-w-0 text-foreground whitespace-normal'
              )}
            >
              {message.role === 'user' ? (
                hasUserComposerMentions(content) ? (
                  <UserMessageComposerPreview content={content} />
                ) : userLiteratureMarkdown ? (
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
                  citationsManifest={effectiveManifest}
                />
              )}
            </div>
            {literatureSources && (
              <CatalystSources
                items={litRefsToSourceItems(literatureSources)}
                className="mt-3 w-full"
              />
            )}
            {effectiveNotes9Sources && (
              <AgentCitationsPanel
                items={effectiveNotes9Sources.map((c, i) =>
                  groundingResourceToPanelItem(c, i)
                )}
                triggerLabel="Sources"
                className="mt-3 w-full"
              />
            )}
            {messageGraphs.length > 0 && (
              <div className="mt-3 w-full">
                <AgentGraphList graphs={messageGraphs} />
              </div>
            )}
            {messageArtifacts.length > 0 && (
              <div className="mt-3 w-full">
                <PersistedArtifactList artifacts={messageArtifacts} />
              </div>
            )}
            <div className="mt-1 opacity-0 group-hover/message:opacity-100 transition-opacity px-1">
              <MessageActions
                sessionId={currentSessionId}
                messageId={message.id}
                messageRole={message.role as 'user' | 'assistant'}
                messageContent={content}
                userEditDisabled={isLastUserAwaitingReply}
                regenerateDisabled={regenerateDisabled}
                onEdit={
                  message.role === 'user'
                    ? () => onSetEditingMessageId(message.id)
                    : undefined
                }
                onRegenerate={isLastAssistant ? onRegenerate : undefined}
                compact
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
});

interface RightSidebarProps {
  onClose?: () => void;
  /** `page` = dedicated /catalyst route (full main column). `panel` = right drawer. */
  variant?: 'panel' | 'page';
  initialSessionId?: string;
  /** Seed composer when opened from a section hero or external launch event. */
  pendingLaunch?: CatalystLaunchDetail | null;
  onPendingLaunchConsumed?: () => void;
  /** Reports whether the chat is in active use (has a conversation / streaming)
   * so the host layout can widen the panel and narrow it when idle. */
  onActiveChange?: (active: boolean) => void;
}

export function RightSidebar({
  onClose,
  variant = 'panel',
  initialSessionId,
  pendingLaunch = null,
  onPendingLaunchConsumed,
  onActiveChange,
}: RightSidebarProps = {}) {
  const user = useAuthUser();
  const isPageVariant = variant === 'page';
  const { setOpenMobile, isMobile } = useSidebar();
  const { setTheme, resolvedTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paperAI = usePaperAI();
  const [input, setInput] = useState('');
  const [agentMode] = useState<CatalystAgentMode>('notes9');
  const { start: startMic, stop: stopMic, isListening: micListening, getWaveformData } = useAwsTranscribe({
    onFinal: (text) => {
      // Read chip-aware text so mention-chip titles aren't pulled into the
      // transcribed message (chips travel via selectedMentions instead).
      const cur = getCatalystComposerPlainText(inputRef.current);
      const next = (cur ? `${cur} ${text}` : text).trimStart();
      setInput(next);
      // Sync the contentEditable DOM so handleSubmit reads the correct text
      requestAnimationFrame(() => {
        if (!inputRef.current) return;
        inputRef.current.innerText = next;
        const range = document.createRange();
        range.selectNodeContents(inputRef.current);
        range.collapse(false);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        resizeInput();
      });
    },
    onInterim: () => {},
    onError: () => {},
  });
  const [taggedLiterature, setTaggedLiterature] = useState<Array<{ id: string; title: string }>>([]);
  // Literature co-pilot context (the active search), primed when a search runs.
  // Lets the user ask about any paper / the research area without attaching.
  const [coPilot, setCoPilot] = useState<CoPilotContext | null>(null);
  const coPilotRef = useRef<CoPilotContext | null>(null);
  coPilotRef.current = coPilot;
  // The literature search's AI summary (streamed in from the literature page),
  // rendered in chronological order within the chat (see litAnchorIndex below).
  const literature = useCatalystLiterature();
  // ID of the persisted chat session for the current literature search.  Set by
  // the persistence useEffect (C3) so the "Continue in Catalyst" button can open it.
  const [literatureSessionId, setLiteratureSessionId] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  /** Todo-style @ menu: row highlight (-1 = none). */
  const [literatureMentionSelectIndex, setLiteratureMentionSelectIndex] = useState(-1);
  const [literatureMentionStartIndex, setLiteratureMentionStartIndex] = useState(-1);
  const [literaturePlainLen, setLiteraturePlainLen] = useState(0);
  const [fallbackMentionCandidates, setFallbackMentionCandidates] = useState<LiteratureMentionCandidate[]>([]);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionOpenForInput, setMentionOpenForInput] = useState(false);
  const [mentionSelectIndex, setMentionSelectIndex] = useState(0);
  const [allMentionItems, setAllMentionItems] = useState<
    Array<{ kind: CatalystMentionKind; id: string; title: string }>
  >([]);
  const [selectedMentions, setSelectedMentions] = useState<
    Array<{ kind: CatalystMentionKind; id: string; title: string }>
  >([]);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(() => new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [notes9Loading, setNotes9Loading] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);
  const literatureEditableRef = useRef<HTMLDivElement>(null);
  const literatureMentionListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [messageAttachments, setMessageAttachments] = useState<Map<string, Attachment[]>>(new Map());
  const pendingAttachmentsRef = useRef<Attachment[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isDraggingContext, setIsDraggingContext] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(isPageVariant);
  const [expandedHistoryOpen, setExpandedHistoryOpen] = useState(true);
  const initialSessionLoadedRef = useRef<string | null>(null);
  /** When set, show main Catalyst chat instead of the paper Writing panel (paper context stays registered). */
  const [paperUiSuppressed, setPaperUiSuppressed] = useState(false);
  const previousPathnameRef = useRef(pathname);
  const savedModeOutsideLiteratureRef = useRef<CatalystAgentMode>('general');
  const wasOnLiteratureRouteRef = useRef(false);
  /** When true, stay on General/Notes9 even while URL is under /literature-reviews (no redirect). */
  const suppressLiteratureAutoModeRef = useRef(false);
  /** Guards against rapid double-Enter / double-click duplicating the same
   *  message before `isLoading` has had a chance to flip. The window is small
   *  (~ms) but real on slow machines and reliable on Enter-key auto-repeat. */
  const submitInFlightRef = useRef(false);
  const historySidebar = useResizable({
    initialWidth: 224,
    minWidth: 208,
    maxWidth: 420,
    direction: 'left',
  });

  const resizeInput = useCallback((reset = false) => {
    const composer = inputRef.current;
    if (!composer) return;
    composer.style.height = 'auto';
    const plain = composer.innerText ?? '';
    const emptyHeight = isPageVariant ? '120px' : '52px';
    if (reset || !plain.trim()) {
      composer.style.height = emptyHeight;
      return;
    }
    composer.style.height = `${Math.min(composer.scrollHeight, 300)}px`;
  }, [isPageVariant]);

  // Cursor-like UI States
  // If messages.length === 0 => "New Chat View" (Input at top/center, Past Chats at bottom)
  // If messages.length > 0 => "Active Chat View" (Messages take space, Input at bottom)

  // Stable client reference — without this, every render creates a new client
  // object, and the seven downstream `useEffect`s that depend on `supabase`
  // re-fire on every keystroke (re-subscribing realtime listeners, re-loading
  // sessions, etc.). The memo holds the client for the lifetime of the panel.
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setMounted(true);
    setThemeMounted(true);
  }, []);

  const supabaseTokenRef = useRef<string | null>(null);
  const webSearchEnabledRef = useRef(false);

  useEffect(() => {
    webSearchEnabledRef.current = webSearchEnabled;
  }, [webSearchEnabled]);

  const buildNotes9StreamOptions = useCallback(
    (tags: Array<{ kind: CatalystMentionKind; id: string; title: string }>) => ({
      tags,
      web_search: webSearchEnabledRef.current ? ('on' as const) : ('off' as const),
    }),
    []
  );

  // Tagged records must be forwarded as top-level `attachments`, NOT only as
  // `options.tags`. The backend preflights `request.attachments` (eager
  // fetch_full_records) so the note/paper/protocol body is in the LLM's first
  // turn; `options.tags` is a legacy annotation the backend ignores. Without
  // this, a tagged note never reaches the agent and it falls back to a title
  // search. Kinds map 1:1 to the AgentAttachment union.
  const tagsToAttachments = useCallback(
    (tags: Array<{ kind: CatalystMentionKind; id: string; title: string }>) => {
      if (tags.length === 0) return undefined;
      // Reconcile each tag against the LIVE mention list before sending. A tag
      // can carry a STALE id — a record that was re-imported under a new UUID
      // (papers commonly get duplicated staging/repository copies) or deleted —
      // when it was persisted in an earlier message/draft. A dead id makes the
      // agent show "Record not found" and then flail. If the live workspace has
      // the same kind + title, remap to the current id; if it's truly gone, drop
      // it with a warning so it never reaches the agent.
      //
      // GUARD: if the live list hasn't loaded yet, pass tags through unchanged —
      // never drop valid tags just because the lookup table is empty.
      if (allMentionItems.length === 0) {
        return tags.map((t) => ({ kind: t.kind, id: t.id, title: t.title }));
      }
      const liveIds = new Set(allMentionItems.map((m) => m.id));
      const norm = (s: string) => (s || '').trim().toLowerCase();
      const out: Array<{ kind: CatalystMentionKind; id: string; title: string }> = [];
      const dropped: string[] = [];
      for (const t of tags) {
        if (liveIds.has(t.id)) {
          out.push({ kind: t.kind, id: t.id, title: t.title });
          continue;
        }
        const match = allMentionItems.find(
          (m) => m.kind === t.kind && norm(m.title) === norm(t.title)
        );
        if (match) {
          out.push({ kind: t.kind, id: match.id, title: match.title });
        } else {
          dropped.push(t.title || t.id);
        }
      }
      if (dropped.length > 0) {
        toast.warning(
          `Skipped ${dropped.length} tagged item${dropped.length > 1 ? 's' : ''} no longer in your workspace: ${dropped.slice(0, 3).join(', ')}${dropped.length > 3 ? '…' : ''}`
        );
      }
      return out.length > 0 ? out : undefined;
    },
    [allMentionItems]
  );

  useEffect(() => {
    const loadUserId = async () => {
      if (!user) return;
      setUserId(user.id);
      const meta = user.user_metadata ?? {};
      const fromMeta =
        (meta.first_name as string | undefined)?.trim() ||
        (meta.full_name as string | undefined)?.split(/\s+/)[0] ||
        '';
      if (fromMeta) {
        setDisplayName(fromMeta);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .maybeSingle();
      const fromProfile = profile?.first_name?.trim() || profile?.last_name?.trim() || '';
      setDisplayName(fromProfile || user.email?.split('@')[0] || '');
    };
    loadUserId();
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    const loadMentionItems = async () => {
      // Serve from cache if it's fresh — no DB connection used.
      if (mentionItemsCache && Date.now() - mentionItemsCache.fetchedAt < MENTION_ITEMS_TTL_MS) {
        setAllMentionItems(mentionItemsCache.items);
        return;
      }
      // Dedupe concurrent mounts: reuse the in-flight promise if one exists.
      if (!mentionItemsInflight) {
        mentionItemsInflight = (async () => {
          const [
            { data: lit },
            { data: notes },
            { data: experiments },
            { data: projects },
            { data: protocols },
          ] = await Promise.all([
            supabase.from('literature_reviews').select('id,title').order('updated_at', { ascending: false }).limit(120),
            supabase.from('lab_notes').select('id,title').order('created_at', { ascending: false }).limit(120),
            supabase.from('experiments').select('id,name').order('created_at', { ascending: false }).limit(120),
            supabase.from('projects').select('id,name').order('created_at', { ascending: false }).limit(120),
            supabase.from('protocols').select('id,name').order('created_at', { ascending: false }).limit(120),
          ]);
          const merged: MentionItem[] = [
            ...(lit ?? []).map((r) => ({ kind: 'literature_review' as const, id: r.id, title: r.title ?? 'Untitled literature' })),
            ...(notes ?? []).map((r) => ({ kind: 'lab_note' as const, id: r.id, title: r.title ?? 'Untitled note' })),
            ...(experiments ?? []).map((r) => ({ kind: 'experiment' as const, id: r.id, title: r.name ?? 'Untitled experiment' })),
            ...(projects ?? []).map((r) => ({ kind: 'project' as const, id: r.id, title: r.name ?? 'Untitled project' })),
            ...(protocols ?? []).map((r) => ({ kind: 'protocol' as const, id: r.id, title: r.name ?? 'Untitled protocol' })),
          ];
          mentionItemsCache = { fetchedAt: Date.now(), items: merged };
          return merged;
        })();
      }
      try {
        const merged = await mentionItemsInflight;
        if (!cancelled) setAllMentionItems(merged);
      } catch (err) {
        // One of the 5 mention-catalog queries failed (network/auth/RLS).
        // Leave the existing (possibly empty) list in place rather than
        // crashing the sidebar; surface the cause for debugging.
        console.error('[RightSidebar] Failed to load @-mention catalog:', err);
      } finally {
        mentionItemsInflight = null;
      }
    };

    loadMentionItems().catch((err) => {
      console.error('[RightSidebar] loadMentionItems failed:', err);
    });
    return () => {
      cancelled = true;
    };
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

  // Chronological anchor for the literature AI-summary panel: the number of chat
  // messages that already existed when the *current* search started. The panel
  // renders after those messages (so it sits below older answers) and before any
  // later follow-ups (which append after it) — instead of being pinned at the very
  // top above stale turns. Re-anchored only when the search query changes (not on
  // every streamed token), read via a ref to avoid a stale-closure capture.
  const messagesLenRef = useRef(0);
  messagesLenRef.current = messages.length;
  const [litAnchorIndex, setLitAnchorIndex] = useState<number | null>(null);
  const literatureQuery = literature?.query;
  useEffect(() => {
    if (literatureQuery) setLitAnchorIndex(messagesLenRef.current);
  }, [literatureQuery]);

  const {
    sessions,
    loading: sessionsLoading,
    createSession,
    loadMessages,
    loadSessions,
    saveMessage,
    currentSessionId,
    setCurrentSessionId,
    updateSessionTitle,
    updateSessionMetadata,
    deleteSession,
    folders,
    foldersAvailable,
    createFolder,
    moveSessionToFolder,
  } = useChatSessions();

  const currentSessionRef = useRef<string | null>(null);

  // Signal the layout when a real conversation is underway (or via a streamed
  // literature summary) so the docked Catalyst sidebar can widen for comfortable
  // reading. Only the docked variant cares — the full page is already wide.
  const hasConversation = messages.length > 0 || !!literature;
  useEffect(() => {
    if (isPageVariant || typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('notes9:catalyst-chat-active', {
        detail: { active: hasConversation },
      }),
    );
  }, [hasConversation, isPageVariant]);

  // A literature-search summary arrives via the in-memory bridge and is shown in
  // a pinned panel — it was never persisted, so these chats never appeared in
  // history. Once a summary finishes streaming, save it as a real session in the
  // UNIFIED Notes9 format (query + formatted assistant markdown with grounding +
  // manifest).  The session kind is 'literature' and carries the compact paper
  // context in metadata.literature so follow-up turns are grounded server-side.
  const persistedLiteratureSigRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!literature || literature.streaming) return;
    const summary = literature.summary?.trim();
    const query = literature.query?.trim();
    if (!summary || !query) return;
    const sig = `${query}::${summary.length}`;
    if (persistedLiteratureSigRef.current.has(sig)) return;
    persistedLiteratureSigRef.current.add(sig);

    let cancelled = false;
    void (async () => {
      // Format as a unified Catalyst assistant turn so reloaded sessions render
      // with [N] chips and the "All citations" panel (parseNotes9AssistantStoredContent).
      const donePayload: DonePayload = {
        role: 'assistant',
        content: literature.summary,
        resources: literature.resources ?? [],
        tool_used: 'literature',
      };
      const formatted = formatNotes9AssistantMarkdown(donePayload, literature.manifest ?? null);
      const sessionId = await createSession(query.slice(0, 80), {
        kind: 'literature',
        metadata: literature.context ? { literature: literature.context } : {},
      });
      if (!sessionId || cancelled) return;
      await saveMessage(sessionId, 'user', query);
      await saveMessage(sessionId, 'assistant', formatted);
      if (!cancelled) {
        setLiteratureSessionId(sessionId);
        setCatalystLiterature({ ...literature, sessionId });
        loadSessions();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only the literature bridge drives this; the session helpers are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [literature]);

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

  const filteredGlobalMentions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return allMentionItems.slice(0, 20);
    return allMentionItems
      .filter((m) => m.title.toLowerCase().includes(q))
      .slice(0, 20);
  }, [allMentionItems, mentionQuery]);

  const mentionIconMarkup = useCallback((kind: CatalystMentionKind): string => {
    // The 5 icon variants are fixed and their markup is deterministic, so we
    // render each one through renderToStaticMarkup at most once and reuse the
    // cached string. This keeps the appendMentionToInput hot path off React's
    // server renderer on every chip insertion while producing byte-identical
    // output.
    const cached = MENTION_ICON_MARKUP_CACHE[kind];
    if (cached !== undefined) return cached;
    const common = 'h-3.5 w-3.5 shrink-0 text-muted-foreground';
    const markup =
      kind === 'literature_review'
        ? renderToStaticMarkup(<BookOpen className={common} />)
        : kind === 'lab_note'
          ? renderToStaticMarkup(<NotebookPen className={common} />)
          : kind === 'experiment'
            ? renderToStaticMarkup(<FlaskConical className={common} />)
            : kind === 'project'
              ? renderToStaticMarkup(<FolderOpen className={common} />)
              : renderToStaticMarkup(<ClipboardInfoIcon className={common} />);
    MENTION_ICON_MARKUP_CACHE[kind] = markup;
    return markup;
  }, []);

  const appendMentionToInput = useCallback(
    (item: { kind: CatalystMentionKind; id: string; title: string }) => {
      const composer = inputRef.current;
      const sel = window.getSelection();
      if (composer && sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        const chip = document.createElement('span');
        chip.contentEditable = 'false';
        chip.className =
          'mx-0.5 inline-flex max-w-[24rem] items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground align-middle';
        chip.setAttribute('data-caty-tag-id', item.id);
        chip.setAttribute('data-caty-tag-kind', item.kind);
        chip.setAttribute('data-caty-tag-title', item.title);

        const icon = document.createElement('span');
        icon.className = 'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center';
        const svgDoc = new DOMParser().parseFromString(mentionIconMarkup(item.kind), 'image/svg+xml');
        const svgEl = svgDoc.documentElement;
        if (svgEl && svgEl.nodeName !== 'parsererror') icon.appendChild(svgEl);
        chip.appendChild(icon);

        const label = document.createElement('span');
        label.className = 'truncate';
        label.textContent = item.title;
        chip.appendChild(label);

        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? '';
          const caretOffset = range.startOffset;
          const beforeCaret = text.slice(0, caretOffset);
          const atIndex = beforeCaret.lastIndexOf('@');
          if (atIndex >= 0) {
            const replaceRange = document.createRange();
            replaceRange.setStart(node, atIndex);
            replaceRange.setEnd(node, caretOffset);
            replaceRange.deleteContents();
            replaceRange.insertNode(chip);
          } else {
            range.deleteContents();
            range.insertNode(chip);
          }
        } else {
          range.deleteContents();
          range.insertNode(chip);
        }

        const spacer = document.createTextNode(' ');
        chip.parentNode?.insertBefore(spacer, chip.nextSibling);
        const caret = document.createRange();
        caret.setStartAfter(spacer);
        caret.collapse(true);
        sel.removeAllRanges();
        sel.addRange(caret);
      }
      setSelectedMentions((prev) => {
        if (prev.some((m) => m.kind === item.kind && m.id === item.id)) return prev;
        return [...prev, item];
      });
      setMentionOpenForInput(false);
      setMentionQuery('');
      setMentionSelectIndex(0);
      requestAnimationFrame(() => {
        const div = inputRef.current;
        if (div) {
          // Sync state from the composer EXCLUDING chip titles, so the dragged
          // paper's title never pollutes the chat input. Chips carry their
          // context via selectedMentions.
          setInput(getCatalystComposerPlainText(div));
        }
        inputRef.current?.focus();
        resizeInput();
      });
    },
    [mentionIconMarkup, resizeInput]
  );

  const finalizeLiteratureAssistant = useCallback(
    async (
      donePayload: LiteratureAgentDonePayload,
      sessionId: string,
      endpoint: 'compare' | 'biomni',
      citationsManifest?: CitationsManifest | null
    ) => {
      const bodyMd = formatLiteratureAssistantMarkdown(donePayload, endpoint);
      const refs = donePayload.structured?.references ?? [];
      const formattedAnswer = serializeLiteratureAssistantStoredContent(
        bodyMd,
        refs,
        citationsManifest ?? literatureAgentStream.citationsManifest
      );
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
      const { donePayload, error, finalizeTag, citationsManifest } =
        await literatureAgentStream.answerClarify(answer, token);
      if (donePayload && finalizeTag)
        await finalizeLiteratureAssistant(donePayload, sid, finalizeTag, citationsManifest);
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
    const { donePayload, error, finalizeTag, citationsManifest } =
      await literatureAgentStream.skipClarify(token);
    if (donePayload && finalizeTag)
      await finalizeLiteratureAssistant(donePayload, sid, finalizeTag, citationsManifest);
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
      if (!user || cancelled) return;
      const { data, error } = await supabase
        .from('literature_reviews')
        .select('id,title,authors,catalog_placement')
        .in('catalog_placement', ['staging', 'repository'])
        .order('updated_at', { ascending: false })
        .limit(300);
      if (error) {
        console.error('[RightSidebar] Failed to load literature mention candidates:', error);
      }
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
    if (onLit || onProtocolDesign) {
      wasOnLiteratureRouteRef.current = onLit;
      suppressLiteratureAutoModeRef.current = true;
      return;
    }
    wasOnLiteratureRouteRef.current = false;
    suppressLiteratureAutoModeRef.current = false;
    setTaggedLiterature([]);
    setMentionOpen(false);
    literatureEditableRef.current?.replaceChildren();
    setLiteraturePlainLen(0);
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
      const unifiedRaw = e.dataTransfer.getData(CATALYST_MENTION_DRAG_MIME);
      if (unifiedRaw) {
        try {
          const p = JSON.parse(unifiedRaw) as CatalystMentionDragPayload;
          if (p?.id && p?.title && p.kind) {
            appendMentionToInput({ kind: p.kind, id: p.id, title: p.title });
            return true;
          }
        } catch {
          /* ignore */
        }
      }

      const raw = e.dataTransfer.getData(LITERATURE_DRAG_MIME);
      if (!raw) return false;
      try {
        const p = JSON.parse(raw) as LiteratureDragPayload;
        if (p?.id && p?.title) {
          appendMentionToInput({
            kind: 'literature_review',
            id: p.id,
            title: p.title,
          });
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    },
    [appendMentionToInput]
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
    if (!isLiteratureRoutePath(pathname ?? null)) {
      window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"));
      router.push('/literature-reviews');
    }
  }, [pathname, router]);

  const goToProtocolAgent = useCallback(() => {
    suppressLiteratureAutoModeRef.current = true;
    if (isProtocolDesignRoute) {
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
      }
    },
    [goToLiteratureAgent, goToProtocolAgent]
  );

  useEffect(() => {
    if (!paperAI?.isActive) {
      setPaperUiSuppressed(false);
    }
  }, [paperAI?.isActive]);


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

  // Surface "in active use" to the host layout (panel variant only) so it can
  // widen while there's a conversation and narrow back to idle when empty.
  useEffect(() => {
    if (isPageVariant) return;
    onActiveChange?.(messages.length > 0 || isLoading);
  }, [isPageVariant, messages.length, isLoading, onActiveChange]);
  const isUploading = uploadQueue.length > 0;

  // Smart auto-scroll — only follows when the user is pinned to the bottom.
  // The previous unconditional auto-scroll fought the user any time they
  // tried to read earlier output while a response was still streaming.
  const {
    onScroll: onChatScroll,
    scrollToBottom: scrollChatToBottom,
    showJumpBottom: chatShowJumpBottom,
  } = usePinnedAutoScroll(chatScrollRef, [
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
  ]);

  useEffect(() => {
    resizeInput();
  }, [input, isLoading, resizeInput]);

  useEffect(() => {
    if (isPageVariant) return;
    if (previousPathnameRef.current !== pathname && isExpanded) {
      setIsExpanded(false);
    }
    previousPathnameRef.current = pathname;
  }, [pathname, isExpanded, isPageVariant]);

  const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      // Register the upload against the current session so (a) catalyst's
      // read_document tool can fetch it and (b) the 7-day TTL cron reaps it.
      // First message may not have a session yet — that's fine, the row is
      // created without a session_id and the file still gets a signed URL.
      const sid = currentSessionRef.current;
      if (sid) formData.append('session_id', sid);
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
        storagePath: data.storagePath,
        chatAttachmentId: data.chatAttachmentId ?? undefined,
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

  const handleTextareaChange = (e: React.FormEvent<HTMLDivElement>) => {
    const v = e.currentTarget.innerText ?? '';
    setInput(v);
    const marker = v.lastIndexOf('@');
    if (marker >= 0) {
      const suffix = v.slice(marker + 1);
      if (!/\s/.test(suffix)) {
        setMentionQuery(suffix);
        setMentionOpenForInput(true);
        setMentionSelectIndex(0);
      } else {
        setMentionOpenForInput(false);
      }
    } else {
      setMentionOpenForInput(false);
    }
    resizeInput();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Drop second-and-later fires until the first send has finished kicking
    // off its async work (createSession, then streaming start). Without this,
    // a quick keyboard repeat on Enter or a fast double-click duplicates the
    // message before `isLoading` flips to true via the streaming hook.
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    try {
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

    const composerStoredMarkdown = serializeComposerToUserMarkdown(inputRef.current);
    const parsedComposerTags = extractTagItemsFromMarkdown(composerStoredMarkdown);
    const requestTags = mergeUniqueTags(selectedMentions, parsedComposerTags);
    const text =
      agentMode === 'literature' && isLiteratureRoute
        ? literaturePlain
        : (getCatalystComposerPlainText(inputRef.current).trim() || input).trim();
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
    if (currentAttachments.length > 0) pendingAttachmentsRef.current = currentAttachments;
    setInput('');
      setSelectedMentions([]);
    setAttachments([]);
    if (inputRef.current) inputRef.current.innerHTML = '';
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

    // Back-fill chat_attachments rows for files uploaded before this session
    // existed (first message of a new chat). Gives them the 7-day TTL + makes
    // them readable by read_document in later turns. Fire-and-forget — the
    // signed URL in file_attachments already lets the agent read them this turn.
    {
      const sid = currentSessionRef.current;
      const toRegister = currentAttachments.filter(
        (a) => a.storagePath && !a.chatAttachmentId,
      );
      if (sid && toRegister.length > 0) {
        fetch('/api/files/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sid,
            items: toRegister.map((a) => ({
              storagePath: a.storagePath,
              fileName: a.name,
              mimeType: a.contentType,
              size: a.size ?? 0,
            })),
          }),
        }).catch((err) => console.warn('Attachment register back-fill failed', err));
      }
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
      const pendingAttsLit = [...pendingAttachmentsRef.current];
      pendingAttachmentsRef.current = [];
      if (pendingAttsLit.length > 0) {
        setMessageAttachments((prev) => new Map(prev).set(userMessageId, pendingAttsLit));
      }

      const sessionId = currentSessionRef.current!;
      const savedUser = await saveMessage(
        sessionId, 'user', userStoredContent,
        pendingAttsLit.length > 0 ? { attachments: pendingAttsLit } : undefined
      );
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
        setMessageAttachments((prev) => {
          const atts = prev.get(userMessageId);
          if (!atts) return prev;
          const next = new Map(prev);
          next.delete(userMessageId);
          next.set(savedUser.id, atts);
          return next;
        });
      }

      const history = messages.map((m) => ({
        role: m.role,
        content: literatureHistoryTurnContent(m),
      }));

      const endpoint = 'compare' as const;
      const { donePayload, error, citationsManifest } = await literatureAgentStream.runRequest(
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
        await finalizeLiteratureAssistant(donePayload, sessionId, endpoint, citationsManifest);
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
      const userStoredContent = composerStoredMarkdown || text;
      const userMessage = {
        id: userMessageId,
        role: 'user' as const,
        content: userStoredContent,
        parts: [{ type: 'text' as const, text: userStoredContent }],
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      const pendingAtts = [...pendingAttachmentsRef.current];
      pendingAttachmentsRef.current = [];
      if (pendingAtts.length > 0) {
        setMessageAttachments((prev) => new Map(prev).set(userMessageId, pendingAtts));
      }

      const sessionId = currentSessionRef.current!;
      const savedUser = await saveMessage(
        sessionId, 'user', userStoredContent,
        pendingAtts.length > 0 ? { attachments: pendingAtts } : undefined
      );
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
        setMessageAttachments((prev) => {
          const atts = prev.get(userMessageId);
          if (!atts) return prev;
          const next = new Map(prev);
          next.delete(userMessageId);
          next.set(savedUser.id, atts);
          return next;
        });
      }

      const history = messages.map((m) => ({
        role: m.role,
        content: notes9HistoryTurnContent(m),
      }));

      setNotes9Loading(true);
      const fileAttachments = (attachments ?? [])
        .slice(0, 5) // mirror backend MAX_FILE_ATTACHMENTS_PER_REQUEST
        .map((a) => ({
          url: a.url,
          name: a.name,
          content_type: a.contentType,
          size: a.size ?? 0,
        }));
      // Literature grounding: prepend the search context (papers + abstracts +
      // summary) to the MODEL query only — the user's visible message stays the
      // clean question. Prefer the DURABLE context persisted on the session
      // (metadata.literature) so a reopened/continued literature chat still
      // grounds follow-ups; fall back to the volatile live co-pilot bridge for
      // the window before the session is persisted. Fixes: follow-ups lost the
      // summary because the co-pilot is cleared on session load and
      // /api/agent/stream never read metadata.literature (endpoint mismatch —
      // only the unused /api/chat path read it).
      const activeLitSession = sessions.find((s) => s.id === sessionId);
      const persistedLitCtx =
        activeLitSession?.kind === 'literature'
          ? ((activeLitSession.metadata as { literature?: LiteratureSessionContext } | null)?.literature ?? null)
          : null;
      const litPreamble = persistedLitCtx
        ? literatureContextToSystemMessage(persistedLitCtx)
        : coPilotRef.current
          ? buildCoPilotPreamble(coPilotRef.current)
          : '';
      const notes9ModelQuery = litPreamble
        ? `${litPreamble}\n\n## User question\n${text}`
        : text;
      const { donePayload, error, artifacts: streamArtifacts, citationsManifest: streamManifest, graphs: streamGraphs } = await agentStream.runStream(
        {
          query: notes9ModelQuery,
          session_id: sessionId,
          history,
          attachments: tagsToAttachments(requestTags),
          file_attachments:
            fileAttachments.length > 0
              ? (fileAttachments as unknown as AgentFileAttachment[])
              : undefined,
          options: buildNotes9StreamOptions(requestTags),
        },
        token
      );
      if (fileAttachments.length > 0) setAttachments([]);
      setNotes9Loading(false);

      if (donePayload) {
        // Structured linkage (Phase 0): artifacts persist in chat_messages.metadata,
        // NOT the fragile markdown block. Render reads metadata first.
        const persistedArts = toPersistedArtifacts(streamArtifacts);
        const formattedAnswer = formatNotes9AssistantMarkdown(donePayload, streamManifest ?? null, streamArtifacts);

        const assistantMessageId = `assistant-${Date.now()}`;
        const assistantMessage = {
          id: assistantMessageId,
          role: 'assistant' as const,
          content: formattedAnswer,
          parts: [{ type: 'text' as const, text: formattedAnswer }],
          createdAt: new Date(),
          metadata: { artifacts: persistedArts, graphs: streamGraphs },
        };
        setMessages((prev) => [...prev, assistantMessage]);
        const savedAsst = await saveMessage(sessionId, 'assistant', formattedAnswer, { artifacts: persistedArts });
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
        // Clear the stale error/partial stream state so the next turn starts clean.
        agentStream.reset();
      }
      return;
    }

    const parts: Array<{ type: 'text'; text: string } | { type: 'file'; url: string; name: string; mediaType: string }> = [];
    for (const attachment of currentAttachments) {
      parts.push({ type: 'file', url: attachment.url, name: attachment.name, mediaType: attachment.contentType });
    }
    if (text.trim()) parts.push({ type: 'text', text });
    await sendMessage({ parts });
    } finally {
      // Always release the in-flight guard so future submits can fire — even
      // if an early-return above bailed out, the try/finally ensures release.
      submitInFlightRef.current = false;
    }
  };

  // Latest-ref to handleSubmit (recreated every render) so callbacks like
  // applyCatalystLaunch can fire a send that reads the current input/attachments
  // without listing handleSubmit as a dependency.
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

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
        const { donePayload, error, citationsManifest } = await literatureAgentStream.runRequest(
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
          await finalizeLiteratureAssistant(donePayload, sid, endpoint, citationsManifest);
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

        // Recover the files attached to the original message so editing the text
        // doesn't drop them (they live in the messageAttachments map, keyed by id).
        const editAtts = messageAttachments.get(messageId) ?? [];
        const savedUser = await saveMessage(
          sid,
          'user',
          newContent,
          editAtts.length > 0 ? { attachments: editAtts } : undefined,
        );
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
          // Re-key the recovered attachments onto the new saved message id so the
          // attachment chips keep rendering after the edit.
          if (editAtts.length > 0) {
            setMessageAttachments((prev) => {
              const next = new Map(prev);
              next.delete(messageId);
              next.set(savedUser.id, editAtts);
              return next;
            });
          }
        }

        setNotes9Loading(true);
        const parsedEditTags = extractTagItemsFromMarkdown(newContent);
        const requestTags = mergeUniqueTags(selectedMentions, parsedEditTags);
        // Re-send the original uploaded files (not just tags) so an edited request
        // keeps its attachments — mirrors the fresh-send file_attachments shape.
        const editFileAttachments = editAtts.slice(0, 5).map((a) => ({
          url: a.url,
          name: a.name,
          content_type: a.contentType,
          size: a.size ?? 0,
        }));
        const { donePayload, error, artifacts: streamArtifacts, citationsManifest: streamManifest, graphs: streamGraphs } = await agentStream.runStream(
          {
            query: newContent,
            session_id: sid,
            history,
            attachments: tagsToAttachments(requestTags),
            file_attachments:
              editFileAttachments.length > 0
                ? (editFileAttachments as unknown as AgentFileAttachment[])
                : undefined,
            options: buildNotes9StreamOptions(requestTags),
          },
          token
        );
        setNotes9Loading(false);

        if (donePayload) {
          const persistedArts = toPersistedArtifacts(streamArtifacts);
          const formattedAnswer = formatNotes9AssistantMarkdown(donePayload, streamManifest ?? null, streamArtifacts);
          const assistantMessageId = `assistant-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMessageId,
              role: 'assistant' as const,
              content: formattedAnswer,
              parts: [{ type: 'text' as const, text: formattedAnswer }],
              createdAt: new Date(),
              metadata: { artifacts: persistedArts, graphs: streamGraphs },
            },
          ]);
          const savedAsst = await saveMessage(sid, 'assistant', formattedAnswer, { artifacts: persistedArts });
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
      const { donePayload, error, citationsManifest } = await literatureAgentStream.runRequest(
        endpoint,
        { query, session_id: sid, history, literature_review_ids: litIds },
        token
      );

      if (donePayload) {
        await finalizeLiteratureAssistant(donePayload, sid, endpoint, citationsManifest);
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
      const parsedRegenTags = extractTagItemsFromMarkdown(query);
      const requestTags = mergeUniqueTags(selectedMentions, parsedRegenTags);
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
      const { donePayload, error, artifacts: streamArtifacts, citationsManifest: streamManifest, graphs: streamGraphs } = await agentStream.runStream(
        {
          query,
          session_id: sid,
          history,
          attachments: tagsToAttachments(requestTags),
          options: buildNotes9StreamOptions(requestTags),
        },
        token
      );
      setNotes9Loading(false);

      if (donePayload) {
        const persistedArts = toPersistedArtifacts(streamArtifacts);
        const formattedAnswer = formatNotes9AssistantMarkdown(donePayload, streamManifest ?? null, streamArtifacts);
        const assistantMessageId = `assistant-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: 'assistant' as const,
            content: formattedAnswer,
            parts: [{ type: 'text' as const, text: formattedAnswer }],
            createdAt: new Date(),
            metadata: { artifacts: persistedArts, graphs: streamGraphs },
          },
        ]);
        const savedAsst = await saveMessage(sid, 'assistant', formattedAnswer, { artifacts: persistedArts });
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
      // Cancel the server run (not just the client read) so generation/billing
      // actually stops. Do NOT reset here: the awaited runStream resolves with a
      // synthetic done payload built from the partial, and the submit handler
      // persists that as the assistant message instead of discarding it.
      agentStream.cancel();
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (mentionOpenForInput && filteredGlobalMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectIndex((i) => Math.min(i + 1, filteredGlobalMentions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        appendMentionToInput(filteredGlobalMentions[mentionSelectIndex] ?? filteredGlobalMentions[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpenForInput(false);
        return;
      }
    }
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
      // A fresh chat drops the pinned literature summary + its co-pilot context.
      setCatalystLiterature(null);
      clearCatalystCoPilot();
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
    // Drop the live literature panel so a persisted literature session renders
    // as its saved messages instead of doubling up with the pinned summary.
    setCatalystLiterature(null);
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
          } catch (err) {
            console.warn('Session history parse failure', err);
            text = '[message could not be displayed]';
          }
        }
        return {
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: text,
          parts: [{ type: 'text' as const, text }],
          createdAt: new Date(m.created_at),
          // Preserve metadata so persisted artifacts (metadata.artifacts) survive
          // a history reload — the previous mapping dropped it.
          metadata: (m as { metadata?: Record<string, unknown> }).metadata,
        };
      });
      setMessages(chatMessages);
      setSavedMessageIds(new Set(msgs.map((m) => m.id)));

      // Hydrate attachment previews from persisted metadata. The persisted
      // `url` is a signed URL that has very likely expired, so we re-sign from
      // the persisted `storagePath` before rendering. Attachments saved before
      // storagePath was persisted (legacy) fall back to their stored url.
      const hydratedAtts = new Map<string, Attachment[]>();
      for (const m of msgs) {
        const atts = (m.metadata as { attachments?: Attachment[] } | undefined)?.attachments;
        if (Array.isArray(atts) && atts.length > 0) hydratedAtts.set(m.id, atts);
      }
      setMessageAttachments(hydratedAtts);

      const pathsToSign = Array.from(
        new Set(
          [...hydratedAtts.values()]
            .flat()
            .map((a) => a.storagePath)
            .filter((p): p is string => !!p),
        ),
      );
      if (pathsToSign.length > 0) {
        fetch('/api/files/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePaths: pathsToSign }),
        })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('sign failed'))))
          .then((data: { urls?: Record<string, string> }) => {
            const urls = data?.urls ?? {};
            if (Object.keys(urls).length === 0) return;
            setMessageAttachments((prev) => {
              const next = new Map(prev);
              for (const [mid, list] of next) {
                next.set(
                  mid,
                  list.map((a) =>
                    a.storagePath && urls[a.storagePath]
                      ? { ...a, url: urls[a.storagePath] }
                      : a,
                  ),
                );
              }
              return next;
            });
          })
          .catch((err) => console.warn('Attachment re-sign failed', err));
      }

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

  useEffect(() => {
    if (!isPageVariant || !initialSessionId || !mounted) return;
    if (initialSessionLoadedRef.current === initialSessionId) return;
    initialSessionLoadedRef.current = initialSessionId;
    loadSession(initialSessionId);
  }, [isPageVariant, initialSessionId, mounted]);

  // On the full Catalyst page, when a citation in an answer navigates to its
  // source document, dock the chat into the sidebar (carrying the session) so
  // the conversation stays on the side instead of being replaced by the doc.
  useEffect(() => {
    if (!isPageVariant) return;
    const onBeforeNav = (e: Event) => {
      const href = (e as CustomEvent<{ href?: string }>).detail?.href;
      if (!href) return;
      e.preventDefault();
      const sid = currentSessionRef.current;
      openCatalystPanel({ dock: true, ...(sid ? { sessionId: sid } : {}) });
      router.push(href);
    };
    window.addEventListener('notes9:catalyst-before-navigate', onBeforeNav as EventListener);
    return () =>
      window.removeEventListener('notes9:catalyst-before-navigate', onBeforeNav as EventListener);
  }, [isPageVariant, router]);

  const applyCatalystLaunch = useCallback(
    (launch: { query?: string; projectId?: string; attachments?: Array<{ url: string; name: string; contentType: string; size?: number }>; webSearch?: boolean; autoSend?: boolean; sessionId?: string }) => {
      // Continue an existing conversation (e.g. minimizing the full page back
      // into the docked sidebar) before seeding any new query.
      if (launch.sessionId && launch.sessionId !== currentSessionRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        loadSession(launch.sessionId);
      }
      const q = launch.query?.trim();
      if (q) {
        setInput(q);
        // The composer is a contentEditable <div>, not a controlled input, so
        // we also have to seed its textContent — otherwise React state and
        // character count update but the visible field stays empty.
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.textContent = q;
            // Drop caret at the end so the user can keep typing.
            const range = document.createRange();
            range.selectNodeContents(inputRef.current);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
          inputRef.current?.focus();
          resizeInput();
          // The prompt arrived from an external composer where the user already
          // hit Send — submit it now (using the latest handleSubmit, which sees
          // the just-seeded input) so they don't have to click Send again.
          if (launch.autoSend) {
            handleSubmitRef.current?.({
              preventDefault() {},
            } as unknown as React.FormEvent);
          }
        });
      }
      const projectId = launch.projectId?.trim();
      if (projectId && isLikelyUuid(projectId)) {
        supabase
          .from('projects')
          .select('name')
          .eq('id', projectId)
          .maybeSingle()
          .then(({ data }) => {
            if (!data?.name) return;
            setSelectedMentions((prev) =>
              prev.some((m) => m.kind === 'project' && m.id === projectId)
                ? prev
                : [...prev, { kind: 'project', id: projectId, title: data.name }],
            );
          });
      }
      if (launch.attachments && launch.attachments.length > 0) {
        setAttachments((prev) => {
          // Same stable-identity dedupe as the CATALYST_ATTACH_EVENT path, so an
          // open-with-attachments launch can't stack duplicate paper chips either.
          const keyOf = (a: { paperKey?: string; url?: string; name?: string }) =>
            a.paperKey || a.url || a.name;
          const seen = new Set(prev.map(keyOf));
          const fresh = launch.attachments!.filter((a) => !seen.has(keyOf(a)));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }
      if (launch.webSearch !== undefined) {
        setWebSearchEnabled(launch.webSearch);
      }
    },
    [resizeInput, supabase],
  );

  useEffect(() => {
    if (!isPageVariant) return;
    const q = searchParams.get('q')?.trim();
    const projectId = searchParams.get('project')?.trim();
    applyCatalystLaunch({
      query: q || undefined,
      projectId: projectId && isLikelyUuid(projectId) ? projectId : undefined,
    });
  }, [isPageVariant, searchParams, applyCatalystLaunch]);

  useEffect(() => {
    if (isPageVariant || !pendingLaunch || !mounted) return;
    applyCatalystLaunch({
      query: pendingLaunch.query,
      projectId: pendingLaunch.projectId,
      attachments: pendingLaunch.attachments,
      webSearch: pendingLaunch.webSearch,
      autoSend: pendingLaunch.autoSend,
      sessionId: pendingLaunch.sessionId,
    });
    onPendingLaunchConsumed?.();
  }, [
    isPageVariant,
    pendingLaunch,
    mounted,
    applyCatalystLaunch,
    onPendingLaunchConsumed,
  ]);

  // Late-attach: a "fly to Catalyst" flourish drops the paper into the composer
  // and, once it lands, dispatches this event so the attachment appears in the
  // chat bar exactly when the animation finishes (not the instant we opened).
  useEffect(() => {
    const onAttach = (e: Event) => {
      const detail = (e as CustomEvent<CatalystAttachDetail>).detail;
      const incoming = detail?.attachments;
      if (!incoming || incoming.length === 0) return;
      setAttachments((prev) => {
        // Dedupe on the stable `paperKey` first: paper attachments from
        // "Ask Catalyst" carry a fresh signed `url` on every press, so a
        // url-keyed dedupe never matches and stacks duplicate chips. Fall back
        // to url/name for ordinary uploads that have no paperKey.
        const keyOf = (a: { paperKey?: string; url?: string; name?: string }) =>
          a.paperKey || a.url || a.name;
        const seen = new Set(prev.map(keyOf));
        const fresh = incoming.filter((a) => !seen.has(keyOf(a)));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    };
    window.addEventListener(CATALYST_ATTACH_EVENT, onAttach);
    return () => window.removeEventListener(CATALYST_ATTACH_EVENT, onAttach);
  }, []);

  // Pick up the literature co-pilot context: read whatever's already primed when
  // the sidebar mounts (opened on demand), and stay in sync as new searches run.
  useEffect(() => {
    setCoPilot(getCatalystCoPilot());
    const onCoPilot = (e: Event) => setCoPilot((e as CustomEvent<CoPilotContext | null>).detail);
    window.addEventListener(CATALYST_COPILOT_EVENT, onCoPilot);
    return () => window.removeEventListener(CATALYST_COPILOT_EVENT, onCoPilot);
  }, []);

  // With a fresh search loaded and no conversation yet, default web search on so
  // the co-pilot can verify/extend beyond the abstracts.
  useEffect(() => {
    if (coPilot && messages.length === 0) setWebSearchEnabled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coPilot]);

  // --- Render Components ---

  const catalystHeroComposerShell = cn(
    'rounded-2xl border border-white/70 bg-white/75 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60',
    'shadow-[0_1px_2px_rgba(44,36,24,0.05),0_16px_44px_-18px_rgba(44,36,24,0.22)]',
    'transition-[border-color,box-shadow] duration-200',
    'focus-within:border-[color:color-mix(in_srgb,var(--n9-accent)_35%,var(--border))]',
    'focus-within:shadow-[0_1px_2px_rgba(44,36,24,0.05),0_12px_32px_-8px_rgba(44,36,24,0.14),0_0_0_3px_color-mix(in_srgb,var(--n9-accent)_12%,transparent)]',
  );

  const renderCursorInput = (opts?: { heroStyle?: boolean }) => {
    const heroStyle = opts?.heroStyle ?? false;
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
                className="outline-none empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/70 min-h-[68px] w-full px-3 py-2.5 text-[13px] leading-5 text-foreground max-h-[300px] overflow-y-auto scrollbar-hide selection:bg-[color:color-mix(in_srgb,var(--n9-accent)_18%,transparent)] selection:text-foreground"
                onBeforeInput={(e) => {
                  const ie = e.nativeEvent as InputEvent;
                  if (!ie.inputType?.startsWith('insert')) return;
                  const ed = literatureEditableRef.current;
                  if (!ed) return;
                  // No character limit enforced here
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
    {coPilot && messages.length === 0 && (
      <div className="mb-2 flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/[0.05] px-3 py-2 text-xs">
        <Telescope className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 leading-snug">
          <span className="font-medium text-foreground">Co-pilot is reading your search</span>
          <span className="text-muted-foreground">
            {' '}— “{coPilot.query}” · {coPilot.papers.length} paper
            {coPilot.papers.length === 1 ? '' : 's'}. Ask about any paper or the research area.
          </span>
        </div>
        <button
          type="button"
          onClick={() => clearCatalystCoPilot()}
          title="Dismiss search context"
          aria-label="Dismiss search context"
          className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )}
    <div className="group/input relative flex flex-col w-full">
      <div
        className={cn(
          'overflow-hidden transition-all',
          heroStyle
            ? catalystHeroComposerShell
            : 'rounded-2xl border border-border/35 bg-card/70 backdrop-blur-md shadow-[0_2px_8px_rgba(44,36,24,0.06),0_14px_38px_-16px_rgba(44,36,24,0.30)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.35),0_18px_44px_-16px_rgba(0,0,0,0.65)] transition-shadow focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/40 focus-within:shadow-[0_2px_10px_rgba(44,36,24,0.08),0_18px_46px_-14px_rgba(44,36,24,0.34)]',
          isDraggingContext && 'border-primary bg-primary/5 ring-2 ring-primary',
        )}
        id="tour-ai-chat"
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-0.5">
            {attachments.map((a) => (
              <PreviewAttachment
                key={a.url || a.name}
                attachment={a}
                compact
                onRemove={() =>
                  setAttachments((prev) =>
                    prev.filter((x) => (x.url || x.name) !== (a.url || a.name)),
                  )
                }
              />
            ))}
            {uploadQueue.map((name) => (
              <PreviewAttachment
                key={`uploading-${name}`}
                attachment={{ name, url: '', contentType: '', size: 0 }}
                compact
                isUploading
              />
            ))}
          </div>
        )}
        <FileDropzone
          onFilesDrop={() => {}}
          onNonFileDrop={handleNonFileDrop}
          accept={ALLOWED_TYPES}
          description="Drop tagged items to attach context"
          activeClassName="ring-2 ring-primary border-primary bg-primary/5 min-h-[132px]"
        >
          <div
            ref={inputRef}
            role="textbox"
            aria-multiline="true"
            aria-label="Message Catalyst"
            aria-disabled={isLoading || contextLoading}
            contentEditable={!isLoading && !contextLoading}
            suppressContentEditableWarning
            onInput={handleTextareaChange}
            onKeyDown={handleKeyDown}
            data-placeholder={
              heroStyle
                ? 'Ask Catalyst anything. Type @ to reference a note, experiment, or paper.'
                : 'Ask Catalyst anything. Use @ to tag notes, experiments, projects, protocols, and literature.'
            }
            className={cn(
              'w-full resize-none bg-transparent focus-visible:outline-2 focus-visible:outline-ring/40 focus-visible:outline-offset-2 scrollbar-hide empty:before:pointer-events-none empty:before:text-muted-foreground/60 empty:before:content-[attr(data-placeholder)]',
              heroStyle
                ? 'min-h-[120px] px-5 py-4 text-[15px] leading-relaxed'
                : 'min-h-[68px] px-4 py-2.5 text-sm',
            )}
          />
        </FileDropzone>
        {mentionOpenForInput && filteredGlobalMentions.length > 0 && (
          <div className="mx-2 mb-1 max-h-52 overflow-y-auto rounded-md border border-border bg-popover p-1">
            {filteredGlobalMentions.map((item, idx) => (
              <button
                key={`${item.kind}:${item.id}`}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs',
                  idx === mentionSelectIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  appendMentionToInput(item);
                }}
              >
                <AtSign className="size-3.5 shrink-0" />
                <span className="truncate">{item.title}</span>
                <span className="ml-auto shrink-0 text-2xs uppercase text-muted-foreground">
                  {item.kind.replace('_', ' ')}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-1 flex min-h-9 items-center justify-between gap-2 px-4 pb-2">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto">
            {/* Attach — anchored bottom-left (Claude-style leading action) */}
            <TooltipProvider delayDuration={400}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0 rounded-lg text-muted-foreground/70 transition-colors duration-150 hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || isUploading}
                    aria-label="Attach file"
                  >
                    <Paperclip className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Attach a file (image, PDF, DOCX, XLSX, CSV)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {agentMode !== 'literature' && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      id="tour-ai-web-search"
                      className={cn(
                        'inline-flex h-7 shrink-0 cursor-default select-none items-center gap-1 rounded-full border px-2 transition-colors duration-150',
                        webSearchEnabled
                          ? 'border-[color:color-mix(in_srgb,var(--n9-accent)_30%,var(--border))] bg-[color:color-mix(in_srgb,var(--n9-accent)_8%,transparent)] text-foreground'
                          : 'border-border/40 bg-muted/20 text-muted-foreground'
                      )}
                    >
                      <Globe
                        className={cn(
                          'size-3 shrink-0',
                          webSearchEnabled ? 'text-[color:var(--n9-accent)]' : 'text-muted-foreground/60'
                        )}
                        aria-hidden
                      />
                      <span className="text-[11px] font-medium whitespace-nowrap">Web</span>
                      <Switch
                        checked={webSearchEnabled}
                        onCheckedChange={setWebSearchEnabled}
                        disabled={isLoading || notes9Loading}
                        aria-label="Toggle web search"
                        className="scale-[0.75] data-[state=checked]:bg-[color:var(--n9-accent)]"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {webSearchEnabled
                      ? 'Web search on — agent may search the web for this reply'
                      : 'Web search off — lab data and documents only'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          <div className="flex h-9 shrink-0 items-center justify-end gap-0.5">
            {/* mic + waveform: flex-row-reverse keeps mic anchored to the right while
                waveform grows to the LEFT — the mic button never shifts position */}
            <div className="inline-flex flex-row-reverse items-center gap-1">
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "size-7 rounded-lg transition-colors duration-150",
                        micListening
                          ? "text-red-500 hover:bg-red-500/10 hover:text-red-600"
                          : "text-muted-foreground/70 hover:text-foreground"
                      )}
                      onClick={() => micListening ? stopMic() : startMic()}
                      aria-label={micListening ? "Stop dictation" : "Start dictation"}
                    >
                      <Mic className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {micListening ? 'Stop dictation' : 'Dictate message'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {micListening && <VoiceWaveform getWaveformData={getWaveformData} />}
            </div>

            {isLoading ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 rounded-lg text-muted-foreground/70 transition-colors duration-150 hover:text-foreground"
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
                  "size-7 rounded-lg transition-all duration-150",
                  canSend
                    ? "bg-[color:var(--n9-accent)] text-white hover:bg-[color:color-mix(in_srgb,var(--n9-accent)_85%,black)]"
                    : "text-muted-foreground/40 hover:text-muted-foreground/60"
                )}
                onClick={(e) => void handleSubmit(e as React.FormEvent)}
                disabled={!canSend || isUploading}
              >
                <ArrowUp className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
    <p className="mt-1.5 text-center text-2xs text-muted-foreground/50 select-none">
      Catalyst can make mistakes — verify important information and cited sources.
    </p>
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
        <span className="text-2xs shrink-0 opacity-70 whitespace-nowrap opacity-0 transition-opacity group-hover/item:opacity-70 mr-2">
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

  // ── Chat-history row actions: pin (float to top) + inline rename ──────
  const sessionIsPinned = (s: ChatSession) =>
    Boolean((s.metadata as Record<string, unknown> | null | undefined)?.pinned);
  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => Number(sessionIsPinned(b)) - Number(sessionIsPinned(a))),
    [sessions],
  );
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const commitSessionRename = useCallback(() => {
    setRenamingSessionId((id) => {
      if (id) {
        const t = renameDraft.trim();
        if (t) void updateSessionTitle(id, t);
      }
      return null;
    });
    setRenameDraft('');
  }, [renameDraft, updateSessionTitle]);
  const cancelSessionRename = useCallback(() => {
    setRenamingSessionId(null);
    setRenameDraft('');
  }, []);

  // The ⋯ actions menu shared by both history surfaces (absolute-positioned in
  // the row's `group/row relative` wrapper).
  const renderSessionMenu = (session: ChatSession) => {
    const pinned = sessionIsPinned(session);
    const md = (session.metadata as Record<string, unknown> | null | undefined) ?? {};
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Chat options"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-1 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-background/70 hover:text-foreground data-[state=open]:bg-background/70 data-[state=open]:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4} className="w-44">
          <DropdownMenuItem onSelect={() => void updateSessionMetadata(session.id, { ...md, pinned: !pinned })}>
            {pinned ? <PinOff className="mr-2 size-4" /> : <Pin className="mr-2 size-4" />}
            {pinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setRenamingSessionId(session.id); setRenameDraft(session.title || ''); }}>
            <Pencil className="mr-2 size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              if (currentSessionId === session.id) { setMessages([]); currentSessionRef.current = null; }
              void deleteSession(session.id);
              toast.success('Chat deleted');
            }}
          >
            <Trash2 className="mr-2 size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Inline rename input reused by both history surfaces.
  const renderSessionRenameInput = () => (
    <input
      autoFocus
      value={renameDraft}
      onChange={(e) => setRenameDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commitSessionRename(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancelSessionRename(); }
      }}
      onBlur={commitSessionRename}
      className="min-w-0 flex-1 rounded border border-[color:color-mix(in_srgb,var(--n9-accent)_45%,var(--border))] bg-background px-1.5 py-0.5 text-sm outline-none"
    />
  );

  // ── Multi-select + folders (full-screen chat history) ────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(() => new Set());
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const toggleChatSelected = (id: string) =>
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedChatIds(new Set());
  }, []);
  const toggleFolderCollapsed = (id: string) =>
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulkDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedChatIds);
    if (ids.length === 0) return;
    if (currentSessionId && ids.includes(currentSessionId)) {
      setMessages([]);
      currentSessionRef.current = null;
    }
    ids.forEach((id) => void deleteSession(id));
    toast.success(`Deleted ${ids.length} chat${ids.length > 1 ? 's' : ''}`);
    exitSelection();
  }, [selectedChatIds, currentSessionId, deleteSession, setMessages, exitSelection]);
  const bulkMoveSelected = useCallback(
    async (folderId: string | null) => {
      const ids = Array.from(selectedChatIds);
      if (ids.length === 0) return;
      await Promise.all(ids.map((id) => moveSessionToFolder(id, folderId)));
      toast.success(
        folderId
          ? `Moved ${ids.length} chat${ids.length > 1 ? 's' : ''} to folder`
          : `Removed ${ids.length} chat${ids.length > 1 ? 's' : ''} from folder`,
      );
      exitSelection();
    },
    [selectedChatIds, moveSessionToFolder, exitSelection],
  );
  const handleNewFolder = useCallback(async (): Promise<string | null> => {
    const name = typeof window !== 'undefined' ? window.prompt('New folder name')?.trim() : '';
    if (!name) return null;
    const folder = await createFolder(name);
    if (!folder) {
      toast.error('Could not create the folder.');
      return null;
    }
    return folder.id;
  }, [createFolder]);
  const createFolderAndMoveSelected = useCallback(async () => {
    const id = await handleNewFolder();
    if (id) await bulkMoveSelected(id);
  }, [handleNewFolder, bulkMoveSelected]);

  // Group sessions into user folders + an ungrouped bucket (pinned float first
  // within the ungrouped list). Folders only appear once the 092 migration is
  // applied (`foldersAvailable`).
  const historyGroups = useMemo(() => {
    const usable = foldersAvailable ? folders : [];
    const byFolder = new Map<string, ChatSession[]>();
    const ungrouped: ChatSession[] = [];
    for (const s of orderedSessions) {
      const fid = s.folder_id ?? null;
      if (fid && usable.some((f) => f.id === fid)) {
        const arr = byFolder.get(fid) ?? [];
        arr.push(s);
        byFolder.set(fid, arr);
      } else {
        ungrouped.push(s);
      }
    }
    return { folders: usable, byFolder, ungrouped };
  }, [orderedSessions, folders, foldersAvailable]);

  // One history row — supports selection checkboxes, inline rename, pin glyph,
  // and the ⋯ actions menu.
  const renderAsideRow = (session: ChatSession) => {
    const isActive = currentSessionId === session.id;
    const pinned = sessionIsPinned(session);
    const isRenaming = renamingSessionId === session.id;
    const isSelected = selectedChatIds.has(session.id);
    return (
      <MotionItem key={session.id} className="group/row relative" role="listitem">
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (isRenaming) return;
            if (selectionMode) toggleChatSelected(session.id);
            else loadSession(session.id);
          }}
          onKeyDown={(e) => {
            if (isRenaming) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (selectionMode) toggleChatSelected(session.id);
              else loadSession(session.id);
            }
          }}
          className={cn(
            'relative flex min-h-9 min-w-0 items-center gap-2 rounded-lg py-2 pl-3 text-left text-sm outline-none transition-all duration-150 hover:bg-[color:color-mix(in_oklab,var(--background)_78%,var(--primary)_22%)] hover:text-sidebar-foreground active:scale-[0.985] dark:hover:bg-sidebar-accent dark:hover:text-sidebar-accent-foreground',
            selectionMode ? 'pr-3' : 'pr-9',
            isActive && !selectionMode && "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:left-0.5 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary before:content-['']",
            isSelected && 'bg-sidebar-accent/70',
          )}
        >
          {selectionMode && (
            <span
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
            >
              {isSelected && <Check className="size-3" />}
            </span>
          )}
          {isRenaming ? (
            renderSessionRenameInput()
          ) : (
            <>
              <span
                className={cn(
                  'block min-w-0 flex-1 truncate font-medium',
                  isActive ? 'text-sidebar-accent-foreground' : 'text-inherit',
                )}
                title={session.title || 'New conversation'}
              >
                {session.title || 'New conversation'}
              </span>
              {pinned && <Pin className="size-3 shrink-0 fill-current text-[color:var(--n9-accent)]" aria-label="Pinned" />}
            </>
          )}
        </div>
        {!isRenaming && !selectionMode && renderSessionMenu(session)}
      </MotionItem>
    );
  };

  const showLiteratureEmptyState = agentMode === 'literature' && isLiteratureRoute;
  const emptyStateSubheading = showLiteratureEmptyState ? 'For Literature' : null;
  const emptyStateDescription = showLiteratureEmptyState
    ? 'Ask about papers, compare findings, and cross-check cited source passages. Use @ to link papers or drop literature rows into the composer.'
    : 'Your intelligent research assistant. Ask anything about your lab notes, experiments, or protocols.';

  const layoutExpanded = isPageVariant || isExpanded;

  const timeGreeting = (() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 21) return 'Good evening';
    const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    return `Happy ${day}`;
  })();

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className={cn(
      "flex flex-col bg-background min-h-0 overflow-hidden",
      isPageVariant
        ? "h-full w-full min-w-0"
        : cn(
            "border-l border-border/45 shadow-[-2px_0_18px_-16px_rgba(44,36,24,0.22)] dark:shadow-[-2px_0_18px_-16px_rgba(0,0,0,0.45)]",
            isExpanded
              // In-place fullscreen overlay, attached edge-to-edge from the app
              // sidebar to the right edge (no detached/floating box). animate-in
              // gives a smooth grow-in; honors reduced-motion.
              ? "fixed top-0 right-0 bottom-0 left-[var(--sidebar-width,0px)] z-[120] w-auto h-full animate-in fade-in zoom-in-95 duration-300 ease-out motion-reduce:animate-none"
              : "h-full w-full min-w-0"
          )
    )}>
      {/* Hidden File Input */}
      <input ref={fileInputRef} type="file" multiple accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={handleFileSelect} disabled={isLoading || isUploading} />

      {!mounted ? (
        <div className="flex flex-1 items-center justify-center">
          <img
            src="/notes9-logo-mark-transparent.png"
            alt="Notes9"
            className="size-7 -translate-y-[5px] object-contain opacity-60 animate-pulse dark:invert dark:brightness-125"
          />
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
          {/* Header: page route uses app chrome; panel uses compact history controls */}
            <header className="h-12 sm:h-14 flex items-center justify-between px-2 sm:px-4 border-b border-[color:var(--glass-border)] shrink-0 bg-[color:var(--n9-header-bg)]/70 backdrop-blur-xl saturate-[1.4] z-10 text-xs select-none">
            <div className="flex items-center gap-1 overflow-hidden min-w-0">
              {isPageVariant && isMobile ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 sm:size-9"
                  onClick={() => setOpenMobile(true)}
                  aria-label="Open navigation"
                >
                  <Menu className="size-4" />
                </Button>
              ) : null}
              {isPageVariant ? (
                <span className="truncate px-1 text-sm font-semibold text-foreground">Catalyst</span>
              ) : null}
              {!isPageVariant && !layoutExpanded && (
                <>
                  <ScrollArea className="w-full whitespace-nowrap scrollbar-hide">
                    <div className="flex items-center gap-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 sm:size-9 text-muted-foreground shrink-0"
                            aria-label="Show chat history"
                          >
                            <History className="size-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" sideOffset={4} className="flex w-[300px] max-w-[min(300px,calc(100vw-2rem))] flex-col overflow-hidden p-0">
                          <div className="p-2 text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider border-b shrink-0">
                            History
                          </div>
                          <div className="h-[300px] w-full overflow-y-auto overflow-x-hidden p-1">
                            {sessions.length === 0 ? (
                              <div className="py-6 text-center text-muted-foreground text-xs">No history yet.</div>
                            ) : (
                              orderedSessions.map((session) => {
                                const isActive = currentSessionId === session.id;
                                const pinned = sessionIsPinned(session);
                                const isRenaming = renamingSessionId === session.id;
                                return (
                                  <div key={session.id} className="group/row relative">
                                    {isRenaming ? (
                                      <div className="flex min-w-0 items-center rounded-md py-1.5 pl-2 pr-2">
                                        {renderSessionRenameInput()}
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => loadSession(session.id)}
                                        className={cn(
                                          "flex w-full min-w-0 items-center justify-between gap-2 rounded-md py-1.5 pl-2 pr-9 text-left text-sm transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                                          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70"
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "block min-w-0 flex-1 truncate font-medium",
                                            isActive ? "text-sidebar-accent-foreground" : "text-inherit"
                                          )}
                                          title={session.title || 'New conversation'}
                                        >
                                          {session.title || 'New conversation'}
                                        </span>
                                        {pinned ? (
                                          <Pin className="size-3 shrink-0 fill-current text-[color:var(--n9-accent)]" aria-label="Pinned" />
                                        ) : (
                                          <span className="shrink-0 text-2xs text-sidebar-foreground/60">
                                            {new Date(session.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                          </span>
                                        )}
                                      </button>
                                    )}
                                    {!isRenaming && renderSessionMenu(session)}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Title kept here so the left cluster reads the same as the
                          page header; the "New chat" action lives in the right
                          cluster in BOTH modes so it never jumps between sides. */}
                      <span className="truncate px-1 text-sm font-semibold text-foreground">Catalyst</span>
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>

            {/* Unified action bar: ONE fixed order in both page and panel modes so
                nothing reorders on minimize/maximize. New chat · Help · Theme ·
                resize toggle (Minimize in page / Maximize in panel, same slot) ·
                Close (panel only, LAST so it never shifts the shared buttons). */}
            <div className="flex items-center gap-1 pl-2 shrink-0">
              <Button
                variant="secondary"
                className="h-8 text-muted-foreground sm:h-9"
                onClick={handleNewChat}
                aria-label="New chat"
                title="New chat"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">New chat</span>
              </Button>
              {isPageVariant && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground sm:size-9"
                    onClick={() => requestPageHelp(pathname ?? '/catalyst')}
                    aria-label="Help: tour this page"
                    title="Help: short tour for this page"
                  >
                    <CircleHelp className="size-4" />
                  </Button>
                  <ReportIssueDialog />
                  <Button
                    id="tour-theme-toggle"
                    variant="ghost"
                    size="icon"
                    className="size-8 sm:size-9"
                    onClick={toggleTheme}
                    aria-label={
                      themeMounted && resolvedTheme === 'dark'
                        ? 'Switch to light mode'
                        : 'Switch to dark mode'
                    }
                    title="Toggle theme"
                  >
                    {!themeMounted ? (
                      <Moon className="size-4" />
                    ) : resolvedTheme === 'dark' ? (
                      <Sun className="size-4" />
                    ) : (
                      <Moon className="size-4" />
                    )}
                  </Button>
                </>
              )}
              {/* Resize toggle — single fixed slot; only the glyph + handler change
                  by mode, so it never appears to move. */}
              {isPageVariant ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground sm:size-9"
                  title="Minimize to sidebar"
                  aria-label="Minimize Catalyst to the sidebar"
                  onClick={() => {
                    // Dock the full page back into the side panel (NOT close it),
                    // carrying the conversation, and return to the page it was
                    // opened from.
                    const sid = currentSessionRef.current;
                    openCatalystPanel({ dock: true, ...(sid ? { sessionId: sid } : {}) });
                    router.push(getCatalystOrigin() ?? '/');
                  }}
                >
                  <Minimize className="size-4" />
                </Button>
              ) : isExpanded ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground sm:size-9"
                  title="Minimize"
                  aria-label="Minimize Catalyst chat"
                  onClick={() => setIsExpanded(false)}
                >
                  <Minimize className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 sm:size-9 text-muted-foreground"
                  title="Expand to full screen"
                  aria-label="Expand Catalyst chat to full screen"
                  onClick={() => {
                    // In-place expand: grow the SAME chat instance to a fullscreen
                    // overlay (isExpanded) instead of router.push('/catalyst').
                    // No route change → no remount/flash, and scroll, streaming,
                    // and composer state are all preserved.
                    setIsExpanded(true);
                  }}
                >
                  <Maximize className="size-4" />
                </Button>
              )}
              {!isPageVariant && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 sm:size-9 text-muted-foreground"
                  title="Close"
                  aria-label="Close Catalyst"
                  onClick={() => onClose?.()}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </header>

          {/* When full screen: left = conversation list, right = chat. Otherwise: single column. */}
          <div className={cn("flex-1 flex min-h-0 overflow-hidden", layoutExpanded ? "flex-row" : "flex-col")}>
            {/* Full-screen / page route: left sidebar with previous conversations.
                Stays mounted and smoothly animates its width to 0 when minimised
                (no width shown when closed), so open/close is fluid, not a pop. */}
            {layoutExpanded && (
              <>
                <aside
                  className={cn(
                    'relative z-10 flex-shrink-0 flex flex-col overflow-hidden bg-transparent min-h-0',
                    expandedHistoryOpen &&
                      '',
                  )}
                  style={{
                    // Open → full width; collapsed → fully gone (width 0, no rail).
                    // A floating button (below) re-opens it from the chat area.
                    width: expandedHistoryOpen ? historySidebar.width : 0,
                    transition: historySidebar.isResizing
                      ? 'none'
                      : 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                {/* Fixed-width inner content so it's clipped (not reflowed) while
                    the panel collapses to 0. */}
                <div
                  className="m-2 flex h-[calc(100%-1rem)] min-h-0 flex-col gap-1 rounded-2xl border border-[color:var(--glass-border)] bg-sidebar/80 p-2 shadow-[0_10px_34px_-18px_rgba(20,14,8,0.4)] backdrop-blur-md dark:bg-sidebar/60 dark:shadow-[0_12px_38px_-16px_rgba(0,0,0,0.6)]"
                  style={{ width: historySidebar.width - 16 }}
                >
                  {/* Header row — close button + "Chats" label on the top-left,
                      new chat on the right. */}
                  <div className="flex h-8 shrink-0 items-center gap-1 rounded-md px-1 text-xs font-medium text-sidebar-foreground/70">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setExpandedHistoryOpen(false)}
                      title="Hide chat history"
                      aria-label="Hide chat history"
                    >
                      <PanelLeft className="h-4 w-4" />
                    </Button>
                    {selectionMode ? (
                      <>
                        <span className="flex-1 truncate text-[0.7rem] font-semibold">
                          {selectedChatIds.size} selected
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={exitSelection}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 truncate text-[0.7rem] font-semibold uppercase tracking-wider">Chats</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => setSelectionMode(true)}
                          title="Select chats"
                          aria-label="Select chats"
                        >
                          <CheckSquare className="h-4 w-4" />
                        </Button>
                        {foldersAvailable && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => void handleNewFolder()}
                            title="New folder"
                            aria-label="New folder"
                          >
                            <FolderPlus className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={handleNewChat}
                          aria-label="New chat"
                        >
                          <PenBox className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  {/* List - same structure as lab notes */}
                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                    {sessionsLoading && sessions.length === 0 ? (
                      <div className="flex flex-col gap-0.5 pr-1" aria-hidden aria-label="Loading conversations">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className="grid min-h-9 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5">
                            <div className="n9-skeleton-shimmer size-8 rounded" />
                            <div className="n9-skeleton-shimmer h-3.5 w-full rounded" />
                            <div className="size-8" />
                          </div>
                        ))}
                      </div>
                    ) : sessions.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sidebar-foreground/70 text-xs">No previous conversations.</div>
                    ) : (
                      <div className="flex min-w-0 flex-col gap-1 pr-1">
                        {historyGroups.folders.map((folder) => {
                          const items = historyGroups.byFolder.get(folder.id) ?? [];
                          const collapsed = collapsedFolders.has(folder.id);
                          return (
                            <div key={folder.id} className="min-w-0">
                              <button
                                type="button"
                                onClick={() => toggleFolderCollapsed(folder.id)}
                                className="flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wider text-sidebar-foreground/55 transition-colors hover:text-sidebar-foreground"
                              >
                                <ChevronRight className={cn('size-3 shrink-0 transition-transform', !collapsed && 'rotate-90')} />
                                <Folder className="size-3 shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
                                <span className="shrink-0 tabular-nums opacity-70">{items.length}</span>
                              </button>
                              {!collapsed && (
                                <MotionList className="flex min-w-0 flex-col gap-0.5 pl-1.5" role="list">
                                  {items.length > 0 ? (
                                    items.map(renderAsideRow)
                                  ) : (
                                    <div className="px-3 py-1.5 text-2xs text-sidebar-foreground/45">Empty — move chats here</div>
                                  )}
                                </MotionList>
                              )}
                            </div>
                          );
                        })}
                        {historyGroups.folders.length > 0 && historyGroups.ungrouped.length > 0 && (
                          <div className="px-1.5 pt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                            Chats
                          </div>
                        )}
                        <MotionList className="flex min-w-0 flex-col gap-0.5" role="list">
                          {historyGroups.ungrouped.map(renderAsideRow)}
                        </MotionList>
                      </div>
                    )}
                  </div>
                  {selectionMode && selectedChatIds.size > 0 && (
                    <div className="mt-1 flex shrink-0 items-center gap-1 rounded-lg border border-[color:var(--glass-border)] bg-background/60 p-1 backdrop-blur-sm">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 flex-1 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={bulkDeleteSelected}
                      >
                        <Trash2 className="size-4" /> Delete
                      </Button>
                      {foldersAvailable && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 flex-1 gap-1.5">
                              <FolderInput className="size-4" /> Move
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={6} className="w-52">
                            <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
                            {folders.map((f) => (
                              <DropdownMenuItem key={f.id} onSelect={() => void bulkMoveSelected(f.id)}>
                                <Folder className="mr-2 size-4" />
                                <span className="truncate">{f.name}</span>
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem onSelect={() => void createFolderAndMoveSelected()}>
                              <FolderPlus className="mr-2 size-4" /> New folder…
                            </DropdownMenuItem>
                            {folders.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => void bulkMoveSelected(null)}>
                                  Remove from folder
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )}
                </div>
              </aside>
              {expandedHistoryOpen && (
                <ResizeHandle
                  onMouseDown={historySidebar.handleMouseDown}
                  isResizing={historySidebar.isResizing}
                  position="right"
                  className="z-10 shrink-0 bg-border/10 hover:bg-border/35"
                />
              )}
              </>
            )}

            {/* Main chat area (narrow: only this; full screen: right side) */}
            <div className="relative flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
              {/* Floating "show chat history" button — appears only when the
                  history panel is collapsed (no rail), at the same vertical spot
                  as the "Chats" header so reopening feels anchored. */}
              {layoutExpanded && !expandedHistoryOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-2 z-20 h-7 w-7 rounded-md bg-background/80 text-foreground/70 shadow-sm backdrop-blur-sm hover:bg-accent hover:text-foreground"
                  onClick={() => setExpandedHistoryOpen(true)}
                  title="Show chat history"
                  aria-label="Show chat history"
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              )}
              {messages.length === 0 && !literature ? (
                isPageVariant ? (
                  <div className="relative min-h-0 flex-1 overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center px-4 py-6 sm:px-6">
                      <div className="flex w-full max-w-3xl flex-col items-center gap-5 sm:gap-6">
                        <div className="space-y-2 text-center">
                          <div className="flex justify-center">
                            <IceMascot
                              className="w-12 shrink-0 rounded-full sm:w-14"
                              options={{ src: '/notes9-mascot-ui.png' }}
                              aria-label="Catalyst AI"
                            />
                          </div>
                          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
                            {timeGreeting}
                            {displayName ? `, ${displayName}` : ''}
                          </h1>
                          {emptyStateSubheading ? (
                            <p className="text-sm text-muted-foreground">{emptyStateSubheading}</p>
                          ) : null}
                        </div>
                        <div className="w-full min-w-0">
                          {renderCursorInput({ heroStyle: true })}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex flex-1 flex-col items-center justify-center px-5 pb-2">
                      <div className="mb-4 flex flex-col items-center gap-2.5">
                        <IceMascot
                          className="w-11 shrink-0 rounded-full ring-2 ring-[color:color-mix(in_srgb,var(--n9-accent)_18%,transparent)] ring-offset-2 ring-offset-background"
                          options={{ src: '/notes9-mascot-ui.png' }}
                          aria-label="Catalyst AI"
                        />
                        <div className="text-center">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--n9-accent)] opacity-80">
                            {emptyStateSubheading ?? 'Catalyst AI'}
                          </p>
                        </div>
                      </div>
                      <p className="max-w-[220px] text-center text-[13px] leading-relaxed text-muted-foreground/80">
                        {emptyStateDescription}
                      </p>
                    </div>
                    <div className="flex-shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-6">
                      <div className="mx-auto min-w-0 max-w-3xl">{renderCursorInput()}</div>
                    </div>
                  </div>
                )
              ) : (
                // --- Active Chat View ---
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden relative">
                  {/* Messages Area — native scroll so we can detect position (ScrollArea viewport is not exposed).
                      h-0 + flex-1 avoids nested-flex collapse where this region gets 0 height and transcripts are
                      clipped while the composer still renders (see catalyst / flex scroll patterns). */}
                  <div
                    ref={chatScrollRef}
                    className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
                    onScroll={onChatScroll}
                    role="log"
                    aria-label="Chat messages"
                  >
                    <div className="flex flex-col gap-6 p-4 pt-5 pb-4 max-w-3xl mx-auto w-full min-w-0">
                      {messages.map((message, index) => {
                        const isLast = index === messages.length - 1;
                        const isLastAssistant = isLast && message.role === 'assistant';
                        // Insert the literature summary at its chronological anchor
                        // (before the message that follows the search), so it reads
                        // newest-after-older rather than pinned above stale turns.
                        const showLitHere = literature && litAnchorIndex === index;
                        return (
                          <Fragment key={message.id}>
                            {showLitHere && literature && (
                              <div className="flex w-full gap-4">
                                <div className="size-6 shrink-0" aria-hidden />
                                <LiteratureSummaryInline
                                  lit={literature}
                                  sessionId={literature.sessionId ?? literatureSessionId}
                                  onContinue={loadSession}
                                />
                              </div>
                            )}
                            <SidebarChatMessageItem
                              message={message as UIMessage}
                              rawContent={sidebarGetMessageContent(message as UIMessage)}
                              messageAttachments={messageAttachments.get(message.id)}
                              isLast={isLast}
                              isLastUserAwaitingReply={isLoading && message.role === 'user' && isLast}
                              regenerateDisabled={isLoading && isLastAssistant}
                              isEditing={editingMessageId === message.id}
                              agentMode={agentMode}
                              isLiteratureRoute={isLiteratureRoute}
                              currentSessionId={currentSessionId}
                              onSetEditingMessageId={setEditingMessageId}
                              onSaveEdit={handleEditMessage}
                              onRegenerate={isLastAssistant ? handleRegenerate : undefined}
                            />
                          </Fragment>
                        );
                      })}
                      {/* Anchor at/after the end (newest action, or empty chat) → render below all messages. */}
                      {literature && (litAnchorIndex == null || litAnchorIndex >= messages.length) && (
                        <div className="flex w-full gap-4">
                          <div className="size-6 shrink-0" aria-hidden />
                          <LiteratureSummaryInline
                            lit={literature}
                            sessionId={literature.sessionId ?? literatureSessionId}
                            onContinue={loadSession}
                          />
                        </div>
                      )}
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
                          <div className="flex min-w-0 flex-1 flex-col gap-2 max-w-full">
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
                                onStop={literatureAgentStream.abort}
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
                                  <p className="animate-pulse text-xs font-medium text-muted-foreground">
                                    Composing answer…
                                  </p>
                                );
                              }
                              return (
                                /*
                                  Live tokens: plain text only, borderless to match the AI
                                  summary. Full MarkdownRenderer (remark/rehype/highlight) on
                                  every chunk blocks the main thread so nothing paints until the
                                  stream ends. Final formatted markdown appears in the saved message.
                                */
                                <div className="w-full min-w-0 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
                                  {livePreview.markdown}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      {literatureAwaitingClarify &&
                        messages.at(-1)?.role === 'user' &&
                        literatureAgentStream.clarify && (
                        <div className="flex w-full justify-start pl-10">
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
                          <Notes9ChatLoader
                            size={24}
                            className="mt-1"
                            progress={toolCardsProgress(agentStream.toolCards)}
                            error={agentStream.error != null}
                          />
                          <div className="flex-1 min-w-0 max-w-full">
                            {agentStream.thinkingSteps.length === 0 &&
                              !agentStream.streamedAnswer &&
                              !agentStream.donePayload &&
                              !agentStream.error ? (
                              <div className="py-2.5 text-sm">
                                <span
                                  className="inline-block w-[3px] h-[1em] bg-foreground/70 rounded-sm animate-cursor-blink translate-y-[2px]"
                                  aria-hidden
                                />
                              </div>
                            ) : (
                              <AgentStreamReply
                                thinkingSteps={agentStream.thinkingSteps}
                                currentStage={agentStream.currentStage}
                                currentThinkingMessage={agentStream.currentThinkingMessage}
                                toolCards={agentStream.toolCards}
                                artifacts={agentStream.artifacts}
                                graphs={agentStream.graphs}
                                reasoning={agentStream.thinkingTokenBuffer}
                                synthesisPlan={agentStream.synthesisPlan}
                                sql={agentStream.sql}
                                ragChunks={agentStream.ragChunks}
                                streamedAnswer={agentStream.streamedAnswer}
                                donePayload={agentStream.donePayload}
                                citationsManifest={agentStream.citationsManifest}
                                error={agentStream.error}
                                compact
                                isThinkingStreaming={agentStream.isStreaming}
                                onStop={handleStopRequest}
                                onRetry={handleRegenerate}
                                runId={agentStream.runId}
                                liveCitationCount={agentStream.liveCitationCount}
                              />
                            )}
                          </div>
                        </div>
                      )}
                      {isLoading &&
                        !(notes9Loading || agentStream.isStreaming || agentStream.error) &&
                        !(agentMode === 'literature' && literatureAgentStream.isStreaming) &&
                        !literatureAwaitingClarify &&
                        messages.at(-1)?.role === 'user' && (
                        <div className="flex gap-4 w-full justify-start">
                          <Notes9ChatLoader size={24} className="mt-1" />
                          <div className="py-2.5 text-sm">
                            <span
                              className="inline-block w-[3px] h-[1em] bg-foreground/70 rounded-sm animate-cursor-blink translate-y-[2px]"
                              aria-hidden
                            />
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} className="h-2 shrink-0" aria-hidden />
                    </div>
                  </div>

                  {/* Fixed Input at Bottom — scroll-to-latest floats centered above, no full-width strip */}
                  <div className="relative flex-shrink-0 z-20">
                    {chatShowJumpBottom ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute bottom-full left-1/2 z-30 mb-2 h-8 w-8 -translate-x-1/2 rounded-full border border-border/50 bg-background/95 shadow-md backdrop-blur-sm hover:bg-muted"
                        onClick={scrollChatToBottom}
                        aria-label="Scroll to latest message"
                      >
                        <ChevronDown className="size-3.5" />
                      </Button>
                    ) : null}
                    <div className="bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-6">
                      <div className="max-w-3xl mx-auto min-w-0">
                        {renderCursorInput()}
                      </div>
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
