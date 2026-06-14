'use client';

import { useState } from 'react';
import {
  Download,
  FileText,
  FileSpreadsheet,
  FileType2,
  ImageIcon,
  File as FileIcon,
  Check,
  FolderInput,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { artifactKind, formatBytes, type ArtifactKind } from '@/lib/agent-artifacts';
import type { AgentArtifact } from '@/hooks/use-agent-stream';
import { Button } from '@/components/ui/button';
import { SaveToDataFilesDialog } from './save-to-data-files-dialog';

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
  word: 'Word document',
  excel: 'Excel workbook',
  file: 'File',
};

interface AgentArtifactCardProps {
  artifact: AgentArtifact;
}

export function AgentArtifactCard({ artifact }: AgentArtifactCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  // Local optimistic state: once saved, flip the draft affordance to "Saved".
  const [saved, setSaved] = useState(!artifact.draft);

  const kind = artifactKind(artifact.mimeType);
  const Icon = KIND_ICON[kind];
  const isImage = kind === 'image' && !!artifact.signedUrl;

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      {/* Image preview strip */}
      {isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artifact.signedUrl!}
          alt={artifact.fileName}
          className="max-h-72 w-full bg-background object-contain"
          loading="lazy"
        />
      )}

      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{artifact.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {KIND_LABEL[kind]}
            {artifact.sizeBytes ? ` · ${formatBytes(artifact.sizeBytes)}` : ''}
            {saved ? ' · Saved to Data files' : artifact.draft ? ' · Draft (not saved)' : ''}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {artifact.signedUrl ? (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <a href={artifact.signedUrl} download={artifact.fileName} target="_blank" rel="noreferrer">
                <Download className="size-4" />
                Download
              </a>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Link expired</span>
          )}

          {saved ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="size-3.5" />
              Saved
            </span>
          ) : (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setDialogOpen(true)}
            >
              <FolderInput className="size-4" />
              Save to Data files
            </Button>
          )}
        </div>
      </div>

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

/** Render a list of artifacts as a vertical stack of cards. */
export function AgentArtifactList({ artifacts }: { artifacts: AgentArtifact[] }) {
  if (!artifacts.length) return null;
  return (
    <div className={cn('flex flex-col gap-2')}>
      {artifacts.map((a) => (
        <AgentArtifactCard key={a.dataId} artifact={a} />
      ))}
    </div>
  );
}
