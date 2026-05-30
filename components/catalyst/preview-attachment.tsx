'use client';

import { X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Attachment {
  url: string;
  name: string;
  contentType: string;
  size?: number;
  /**
   * Object key inside the `user` storage bucket. The `user` bucket is PRIVATE,
   * so `url` is a short-lived signed URL that expires with the file's 7-day TTL.
   * We persist `storagePath` (NOT the signed url) in message metadata so the
   * link can be re-signed when chat history is reloaded.
   */
  storagePath?: string;
  /** Row id in `chat_attachments` (present when registered against a session). */
  chatAttachmentId?: string;
}

interface PreviewAttachmentProps {
  attachment: Attachment;
  onRemove?: () => void;
  isUploading?: boolean;
  compact?: boolean;
}

export function PreviewAttachment({
  attachment,
  onRemove,
  isUploading = false,
  compact = false,
}: PreviewAttachmentProps) {
  const isImage = attachment.contentType.startsWith('image/');

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  if (compact) {
    // Images get a small thumbnail preview; PDFs / spreadsheets / docs stay as
    // a lightweight icon chip (no preview needed) per product spec.
    const showThumb = isImage && !!attachment.url && !isUploading;
    return (
      <div className="relative group">
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-muted/50 py-1.5',
            showThumb ? 'pl-1.5 pr-2' : 'px-2',
            isUploading && 'opacity-60'
          )}
        >
          {isUploading ? (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          ) : showThumb ? (
            <img
              src={attachment.url}
              alt={attachment.name}
              className="size-7 rounded-md object-cover shrink-0"
            />
          ) : isImage ? (
            <ImageIcon className="size-3 text-muted-foreground" />
          ) : (
            <FileText className="size-3 text-muted-foreground" />
          )}
          <span className="text-xs truncate max-w-[100px]">{attachment.name}</span>
          {onRemove && !isUploading && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-4 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      <div
        className={cn(
          'relative flex flex-col items-center rounded-xl border bg-muted/50 p-2',
          'w-20 h-20',
          isUploading && 'opacity-60'
        )}
      >
        {isUploading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : isImage && attachment.url ? (
          <img
            src={attachment.url}
            alt={attachment.name}
            className="size-12 rounded-md object-cover"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <FileText className="size-8 text-muted-foreground" />
          </div>
        )}
        <span className="text-2xs text-muted-foreground truncate w-full text-center mt-1">
          {attachment.name.length > 12
            ? `${attachment.name.slice(0, 8)}...${attachment.name.split('.').pop()}`
            : attachment.name}
        </span>
      </div>

      {onRemove && !isUploading && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute -top-2 -right-2 size-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="size-3" />
        </Button>
      )}
    </div>
  );
}

