'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface MessageEditorProps {
  messageId: string;
  initialContent: string;
  setMode: Dispatch<SetStateAction<'view' | 'edit'>>;
  onSave: (messageId: string, newContent: string) => Promise<void>;
  compact?: boolean;
}

export function MessageEditor({
  messageId,
  initialContent,
  setMode,
  onSave,
  compact = false,
}: MessageEditorProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftContent, setDraftContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [adjustHeight]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraftContent(event.target.value);
    adjustHeight();
  };

  const handleSubmit = async () => {
    if (!draftContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSave(messageId, draftContent.trim());
      setMode('view');
    } catch {
      // Error handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setMode('view');
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <Textarea
        ref={textareaRef}
        value={draftContent}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        className={
          compact
            ? 'w-full resize-none overflow-hidden rounded-lg bg-transparent text-xs outline-none min-h-[60px]'
            : 'w-full resize-none overflow-hidden rounded-xl bg-transparent text-sm outline-none min-h-[80px]'
        }
        disabled={isSubmitting}
      />
      <div className="flex flex-row justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size={compact ? 'sm' : 'default'}
          className={compact ? 'h-7 px-2 text-xs' : 'h-8 px-3'}
          onClick={() => setMode('view')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size={compact ? 'sm' : 'default'}
          className={compact ? 'h-7 px-2 text-xs' : 'h-8 px-3'}
          onClick={handleSubmit}
          disabled={isSubmitting || !draftContent.trim()}
        >
          {isSubmitting ? 'Sending...' : 'Send'}
        </Button>
      </div>
    </div>
  );
}

