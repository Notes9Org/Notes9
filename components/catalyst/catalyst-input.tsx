'use client';

import { useRef, useEffect, useState, useCallback, type ChangeEvent } from 'react';
import { ArrowUp, Square, Paperclip, Clock, X, Globe, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PreviewAttachment, type Attachment } from './preview-attachment';
import { ModelSelector } from './model-selector';
import { toast } from 'sonner';

export type AgentMode = 'general' | 'notes9';

interface CatalystInputProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (text: string, attachments?: Attachment[]) => void;
  isLoading: boolean;
  stop: () => void;
  hasMessages: boolean;
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  agentMode: AgentMode;
  onAgentModeChange: (mode: AgentMode) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
];

export function CatalystInput({
  input,
  setInput,
  onSubmit,
  isLoading,
  stop,
  hasMessages,
  selectedModelId,
  onModelChange,
  agentMode,
  onAgentModeChange,
}: CatalystInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

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
      toast.error(error instanceof Error ? error.message : 'Failed to upload file');
      return null;
    }
  }, []);

  const handleFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;

      // Validate files
      const validFiles = files.filter((file) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name} is too large (max 10MB)`);
          return false;
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
          toast.error(`${file.name} has unsupported type`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      // Add to upload queue
      setUploadQueue(validFiles.map((f) => f.name));

      // Upload all files
      const uploadPromises = validFiles.map((file) => uploadFile(file));
      const results = await Promise.all(uploadPromises);

      // Add successful uploads to attachments
      const successfulUploads = results.filter((r): r is Attachment => r !== null);
      setAttachments((prev) => [...prev, ...successfulUploads]);

      // Clear queue and input
      setUploadQueue([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [uploadFile]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith('image/')
      );

      if (imageItems.length === 0) return;

      event.preventDefault();
      setUploadQueue(['Pasted image']);

      const files = imageItems
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      const uploadPromises = files.map((file) => uploadFile(file));
      const results = await Promise.all(uploadPromises);

      const successfulUploads = results.filter((r): r is Attachment => r !== null);
      setAttachments((prev) => [...prev, ...successfulUploads]);
      setUploadQueue([]);
    },
    [uploadFile]
  );

  // Add paste listener
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.addEventListener('paste', handlePaste);
    return () => textarea.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    onSubmit(input, attachments.length > 0 ? attachments : undefined);
    setInput('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const isUploading = uploadQueue.length > 0;

  return (
    <div className={cn('mx-auto w-full max-w-3xl px-4 pb-6', hasMessages ? 'pt-4' : 'pt-0')}>
      <form onSubmit={handleSubmit}>
        <div className="relative rounded-2xl border border-border bg-background shadow-sm transition-all focus-within:border-primary/50 focus-within:shadow-md">
          {/* Agent Mode Toggle */}
          <div className="flex items-center gap-1 p-2 border-b border-border/50">
            <Button
              type="button"
              variant={agentMode === 'notes9' ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'h-8 gap-2 text-xs font-medium transition-all',
                agentMode === 'notes9' && 'bg-primary text-primary-foreground'
              )}
              onClick={() => onAgentModeChange('notes9')}
              disabled={isLoading}
            >
              <FlaskConical className="size-3.5" />
              Notes9
            </Button>
            <Button
              type="button"
              variant={agentMode === 'general' ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'h-8 gap-2 text-xs font-medium transition-all',
                agentMode === 'general' && 'bg-primary text-primary-foreground'
              )}
              onClick={() => onAgentModeChange('general')}
              disabled={isLoading}
            >
              <Globe className="size-3.5" />
              General
            </Button>
          </div>

          {/* Attachment Previews */}
          {(attachments.length > 0 || uploadQueue.length > 0) && (
            <div className="flex flex-wrap gap-2 p-3 pb-0">
              {attachments.map((attachment, index) => (
                <PreviewAttachment
                  key={attachment.url}
                  attachment={attachment}
                  onRemove={() => handleRemoveAttachment(index)}
                />
              ))}
              {uploadQueue.map((name) => (
                <PreviewAttachment
                  key={name}
                  attachment={{ url: '', name, contentType: '' }}
                  isUploading
                />
              ))}
            </div>
          )}

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="How can I help you today?"
            className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent px-4 pt-4 pb-14 text-base focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isLoading}
          />

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(',')}
            className="hidden"
            onChange={handleFileSelect}
            disabled={isLoading || isUploading}
          />

          {/* Toolbar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-2">
            {/* Left tools */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                disabled={isLoading || isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                disabled={isLoading}
              >
                <Clock className="size-4" />
              </Button>
            </div>

            {/* Right - Model selector + Submit/Stop button */}
            <div className="flex items-center gap-2">
              {agentMode === 'general' && (
                <ModelSelector
                  selectedModelId={selectedModelId}
                  onModelChange={onModelChange}
                  disabled={isLoading}
                />
              )}

              {isLoading ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-8 rounded-full"
                  onClick={stop}
                >
                  <Square className="size-3" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="size-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  disabled={(!input.trim() && attachments.length === 0) || isUploading}
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Helper text */}
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Paste images or click <Paperclip className="inline size-3" /> to attach files
      </p>
    </div>
  );
}
