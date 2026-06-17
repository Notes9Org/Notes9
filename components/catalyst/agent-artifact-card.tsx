'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  FileText,
  FileSpreadsheet,
  FileType2,
  ImageIcon,
  File as FileIcon,
  Check,
  FolderInput,
  Eye,
  Loader2,
  ZoomIn,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  artifactKind,
  formatBytes,
  persistedToArtifact,
  resignArtifact,
  type ArtifactKind,
  type PersistedArtifact,
} from '@/lib/agent-artifacts';
import type { AgentArtifact } from '@/hooks/use-agent-stream';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SaveToDataFilesDialog } from './save-to-data-files-dialog';

// ── Icon map ──────────────────────────────────────────────────────────────────

const KIND_ICON: Record<ArtifactKind, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  pdf: FileText,
  word: FileType2,
  excel: FileSpreadsheet,
  file: FileIcon,
};

const KIND_LABEL: Record<ArtifactKind, string> = {
  image: 'Figure',
  pdf: 'PDF',
  word: 'Word',
  excel: 'Excel',
  file: 'File',
};

// Per-type accent tile — small colored icon square (left of the filename row).
// Restrained alpha so it reads as a tint, not a badge fight.
const KIND_ACCENT: Record<ArtifactKind, string> = {
  image:
    'bg-violet-500/10 text-violet-600 dark:bg-violet-400/12 dark:text-violet-400',
  pdf: 'bg-red-500/10 text-red-600 dark:bg-red-400/12 dark:text-red-400',
  word: 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/12 dark:text-blue-400',
  excel:
    'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/12 dark:text-emerald-400',
  file: 'bg-muted text-muted-foreground',
};

// Thinner left-edge accent bar per type — replaces the broad colored area that
// dominated the old layout.
const KIND_BORDER: Record<ArtifactKind, string> = {
  image: 'border-l-violet-400/60 dark:border-l-violet-500/50',
  pdf: 'border-l-red-400/60 dark:border-l-red-500/50',
  word: 'border-l-blue-400/60 dark:border-l-blue-500/50',
  excel: 'border-l-emerald-400/60 dark:border-l-emerald-500/50',
  file: 'border-l-border',
};

// ── Supabase token helper (singleton so N cards share one client) ─────────────

let _cachedClient: ReturnType<typeof createClient> | null = null;
async function getAccessToken(): Promise<string | null> {
  try {
    _cachedClient = _cachedClient ?? createClient();
    const { data } = await _cachedClient.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function triggerDownload(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener noreferrer';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ── Thumbnail states ──────────────────────────────────────────────────────────

type ThumbState = 'loading' | 'ready' | 'error';

// ── AgentArtifactCard ─────────────────────────────────────────────────────────

interface AgentArtifactCardProps {
  artifact: AgentArtifact;
}

export function AgentArtifactCard({ artifact }: AgentArtifactCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saved, setSaved] = useState(!artifact.draft);
  const [liveUrl, setLiveUrl] = useState<string | null>(artifact.signedUrl ?? null);
  const [resigning, setResigning] = useState(false);
  // Three-state image thumbnail: loading while re-signing, ready once URL is
  // live, error if the resign fails so we fall back to the icon tile.
  const [thumbState, setThumbState] = useState<ThumbState>(
    artifact.signedUrl ? 'ready' : 'loading',
  );
  // Whether the user has expanded the image from the thumbnail to the full
  // inline preview (click-to-expand behaviour).
  const [expanded, setExpanded] = useState(false);
  // True once the backend reports the draft is gone (24h TTL swept) — the card
  // then shows an honest "expired" tombstone instead of a broken preview.
  const [expired, setExpired] = useState(false);

  const triedResign = useRef(false);
  const liveUrlRef = useRef<string | null>(artifact.signedUrl ?? null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const kind = artifactKind(artifact.mimeType);
  const Icon = KIND_ICON[kind];
  // The URL to use for inline rendering and downloads. Prefer the freshly
  // re-signed URL; fall back to the original if we haven't re-signed yet.
  const activeUrl = liveUrl ?? artifact.signedUrl ?? null;
  const isImage = kind === 'image';

  // ── Lazy re-sign ─────────────────────────────────────────────────────────────

  const ensureUrl = useCallback(async (): Promise<string | null> => {
    if (artifact.signedUrl) return artifact.signedUrl;
    if (liveUrlRef.current) return liveUrlRef.current;
    if (triedResign.current) return null;
    triedResign.current = true;
    setResigning(true);
    const token = await getAccessToken();
    const res = await resignArtifact(artifact.dataId, token);
    const signed = res && 'signed_url' in res ? res.signed_url : null;
    if (!mountedRef.current) return signed;
    setResigning(false);
    if (signed) {
      liveUrlRef.current = signed;
      setLiveUrl(signed);
      return signed;
    }
    // 410 ⇒ draft swept past its TTL: show the expired tombstone.
    if (res && 'expired' in res) setExpired(true);
    // Re-sign failed — flip the thumbnail to error state so we render the
    // icon tile instead of a broken image or an empty box.
    if (isImage) setThumbState('error');
    return null;
  }, [artifact.signedUrl, artifact.dataId, isImage]);

  // Auto-resign image thumbnails on mount so they appear without a user click.
  useEffect(() => {
    if (!artifact.signedUrl && isImage) {
      void ensureUrl().then((url) => {
        if (!mountedRef.current) return;
        if (url) {
          setThumbState('ready');
        } else {
          setThumbState('error');
        }
      });
    }
  }, [artifact.signedUrl, isImage, ensureUrl]);

  const handleOpen = useCallback(async () => {
    const u = activeUrl ?? (await ensureUrl());
    if (u) window.open(u, '_blank', 'noopener,noreferrer');
  }, [activeUrl, ensureUrl]);

  // ── Derived display strings ───────────────────────────────────────────────────

  const metaLine = [
    KIND_LABEL[kind],
    artifact.sizeBytes ? formatBytes(artifact.sizeBytes) : null,
    saved
      ? 'Saved'
      : artifact.draft
        ? 'Draft'
        : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // ── Thumbnail tile (images only) ─────────────────────────────────────────────

  // The thumbnail is a 64×64 square tile that lives inside the icon slot.
  // When the user clicks it the card expands to show a constrained 200px-tall
  // inline preview. Clicking again collapses it.
  function renderThumbTile() {
    if (!isImage) return null;

    if (thumbState === 'loading' || resigning) {
      return (
        <Skeleton
          className="size-14 shrink-0 rounded-lg"
          aria-label="Loading image preview"
          role="img"
        />
      );
    }

    if (thumbState === 'error' || !activeUrl) {
      // Graceful degradation — render the icon tile, same as non-image kinds.
      return null;
    }

    return (
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'group relative size-14 shrink-0 overflow-hidden rounded-lg border border-border/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'transition-opacity hover:opacity-90',
        )}
        aria-label={expanded ? `Collapse preview of ${artifact.fileName}` : `Expand preview of ${artifact.fileName}`}
        aria-expanded={expanded}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeUrl}
          alt={`Thumbnail of ${artifact.fileName}`}
          className="size-full object-cover"
          loading="lazy"
          onError={() => {
            if (mountedRef.current) setThumbState('error');
          }}
        />
        {/* Hover overlay hint */}
        <span
          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        >
          <ZoomIn className="size-4 text-white drop-shadow" />
        </span>
      </button>
    );
  }

  // Whether we fall back to the icon tile (non-image types, or image with
  // failed/missing thumbnail).
  const showIconTile = !isImage || thumbState === 'error' || (!activeUrl && thumbState !== 'loading');

  // ── Expanded inline preview (images, click-to-expand) ────────────────────────

  function renderExpandedPreview() {
    if (!isImage || !expanded || !activeUrl) return null;
    return (
      <div className="border-t border-border/50 bg-muted/20">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className={cn(
            'block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          )}
          aria-label={`Collapse preview of ${artifact.fileName}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeUrl}
            alt={artifact.fileName}
            className="mx-auto max-h-48 w-full object-contain py-2"
            loading="lazy"
          />
        </button>
      </div>
    );
  }

  // ── Status badge ─────────────────────────────────────────────────────────────

  // Rendered as a small inline label — not a chip — to keep the row tight.
  // Screen readers read the metaLine which already contains the status, so
  // this span is aria-hidden to avoid duplication.
  function renderStatus() {
    if (saved) {
      return (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
          aria-hidden="true"
        >
          <Check className="size-3" />
          Saved
        </span>
      );
    }
    if (resigning) {
      return (
        <span
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          <Loader2 className="size-3 animate-spin" />
          Loading…
        </span>
      );
    }
    return null;
  }

  // ── Expired tombstone ─────────────────────────────────────────────────────────
  // The draft was swept past its 24h TTL (and was never saved to Data files).
  // Show an honest, compact tombstone instead of a broken preview or dead buttons.
  if (expired) {
    return (
      <div
        className="surface-primary overflow-hidden border-l-2 border-l-border"
        role="region"
        aria-label={`Expired file: ${artifact.fileName}`}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground/50"
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-medium leading-snug text-muted-foreground line-through decoration-muted-foreground/40"
              title={artifact.fileName}
            >
              {artifact.fileName}
            </p>
            <p className="mt-0.5 text-xs leading-none text-muted-foreground/70">
              Expired — unsaved drafts are kept 24h. Generate it again to recreate it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        // Card shell: cream surface, subtle border, left accent stripe.
        // `surface-primary` from globals.css gives it the correct tier lift
        // above the recessed background without extra inline shadow hacks.
        'surface-primary overflow-hidden border-l-2',
        KIND_BORDER[kind],
      )}
      // Announce the artifact to screen readers when it is first rendered.
      role="region"
      aria-label={`${KIND_LABEL[kind]}: ${artifact.fileName}`}
    >
      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">

        {/* Left tile: thumbnail for images, coloured icon for everything else */}
        {isImage && thumbState === 'loading' ? (
          <Skeleton
            className="size-14 shrink-0 rounded-lg"
            aria-label="Loading image preview"
            role="img"
          />
        ) : isImage && thumbState === 'ready' && activeUrl ? (
          renderThumbTile()
        ) : showIconTile ? (
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              KIND_ACCENT[kind],
            )}
            aria-hidden="true"
          >
            {resigning
              ? <Loader2 className="size-4 animate-spin" />
              : <Icon className="size-4" />}
          </span>
        ) : (
          renderThumbTile()
        )}

        {/* File info */}
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium leading-snug text-foreground"
            title={artifact.fileName}
          >
            {artifact.fileName}
          </p>
          {/* Screen-reader-accessible status embedded in meta line */}
          <p
            className="mt-0.5 text-xs leading-none text-muted-foreground"
            aria-label={metaLine}
          >
            <span aria-hidden="true">
              {KIND_LABEL[kind]}
              {artifact.sizeBytes ? ` · ${formatBytes(artifact.sizeBytes)}` : ''}
            </span>
            {/* Visually hidden status for screen readers that already read metaLine */}
            <span className="sr-only">{saved ? ', saved to Data files' : artifact.draft ? ', draft, not yet saved' : ''}</span>
          </p>
        </div>

        {/* Action cluster */}
        <div className="flex shrink-0 items-center gap-0.5">

          {/* Inline status indicator (visual only — already in sr metaLine) */}
          <span className="mr-1 hidden sm:flex">{renderStatus()}</span>

          {/* Preview — for non-images opens in a new tab; for images the
              thumbnail tile itself is the expand trigger, but we keep this
              so the card is still operable when the thumbnail fails. */}
          {(!isImage || thumbState === 'error' || !activeUrl) && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleOpen}
              aria-label={`Preview ${artifact.fileName}`}
              title="Preview"
              className="text-muted-foreground hover:text-foreground"
            >
              <Eye className="size-4" aria-hidden="true" />
            </Button>
          )}

          {/* Download */}
          {activeUrl ? (
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              title={`Download ${artifact.fileName}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <a
                href={activeUrl}
                download={artifact.fileName}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Download ${artifact.fileName}`}
              >
                <Download className="size-4" aria-hidden="true" />
              </a>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              title={`Download ${artifact.fileName}`}
              aria-label={`Download ${artifact.fileName}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={async () => {
                const u = await ensureUrl();
                if (u) triggerDownload(u, artifact.fileName);
              }}
            >
              <Download className="size-4" aria-hidden="true" />
            </Button>
          )}

          {/* Save to Data files / Saved badge */}
          {saved ? (
            <span
              className={cn(
                'ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1',
                'bg-emerald-500/10 text-xs font-medium text-emerald-700 dark:text-emerald-400',
              )}
              role="status"
              aria-label="Saved to Data files"
            >
              <Check className="size-3" aria-hidden="true" />
              <span className="hidden sm:inline">Saved</span>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                'ml-1 gap-1 text-xs font-medium',
                // Use the N9 accent tint for the primary CTA, keeping brand coherence.
                'border border-[var(--n9-accent)]/30 bg-[var(--n9-accent-light)] text-[var(--n9-accent)]',
                'hover:bg-[var(--n9-accent)]/10 hover:text-[var(--n9-accent-hover)]',
                'focus-visible:ring-[var(--ring)]',
              )}
              onClick={() => setDialogOpen(true)}
              aria-label={`Save ${artifact.fileName} to Data files`}
            >
              <FolderInput className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Save</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Expanded inline preview (images, collapsible) ─────────────────── */}
      {renderExpandedPreview()}

      {/* ── Dialog ────────────────────────────────────────────────────────── */}
      {!saved && (
        <SaveToDataFilesDialog
          artifact={artifact}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSaved={() => setSaved(true)}
        />
      )}
    </div>
  );
}

// ── List exports (contract unchanged) ────────────────────────────────────────

/** Render a list of LIVE (streaming) artifacts as a vertical stack of cards. */
export function AgentArtifactList({ artifacts }: { artifacts: AgentArtifact[] }) {
  if (!artifacts.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {artifacts.map((a) => (
        <AgentArtifactCard key={a.dataId} artifact={a} />
      ))}
    </div>
  );
}

/**
 * Render PERSISTED artifacts (parsed from a saved assistant message). These have
 * no live signed URL — each card re-signs lazily by data_id.
 */
export function PersistedArtifactList({ artifacts }: { artifacts: PersistedArtifact[] }) {
  if (!artifacts.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {artifacts.map((p) => (
        <AgentArtifactCard key={p.data_id} artifact={persistedToArtifact(p) as AgentArtifact} />
      ))}
    </div>
  );
}
