'use client';

import { memo, useState, type ComponentProps, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Copy,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Vote } from '@/lib/db/schema';

// Action Button Component
interface ActionButtonProps extends ComponentProps<typeof Button> {
  tooltip?: string;
  children: ReactNode;
}

function ActionButton({
  tooltip,
  children,
  className,
  ...props
}: ActionButtonProps) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'size-7 text-muted-foreground hover:text-foreground transition-colors',
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}

// Message Actions Props
export interface MessageActionsProps {
  sessionId: string | null;
  messageId: string;
  messageRole: 'user' | 'assistant';
  messageContent: string;
  vote?: Vote;
  isLoading?: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
  compact?: boolean;
}

function PureMessageActions({
  sessionId,
  messageId,
  messageRole,
  messageContent,
  vote,
  isLoading = false,
  onEdit,
  onRegenerate,
  compact = false,
}: MessageActionsProps) {
  const [isCopied, setIsCopied] = useState(false);

  if (isLoading) {
    return null;
  }

  const handleCopy = async () => {
    if (!messageContent) {
      toast.error("There's no text to copy!");
      return;
    }
    try {
      await navigator.clipboard.writeText(messageContent);
      setIsCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleUpvote = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch('/api/vote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: sessionId,
          messageId,
          type: 'up',
        }),
      });

      if (!response.ok) throw new Error('Failed to upvote');
      toast.success('Upvoted response!');
    } catch {
      toast.error('Failed to upvote response');
    }
  };

  const handleDownvote = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch('/api/vote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: sessionId,
          messageId,
          type: 'down',
        }),
      });

      if (!response.ok) throw new Error('Failed to downvote');
      toast.success('Downvoted response');
    } catch {
      toast.error('Failed to downvote response');
    }
  };

  // User messages: Edit + Copy
  if (messageRole === 'user') {
    return (
      <div
        className={cn(
          'flex items-center gap-0.5 opacity-0 group-hover/message:opacity-100 transition-opacity',
          compact ? 'mt-1' : 'mt-1.5'
        )}
      >
        {onEdit && (
          <ActionButton tooltip="Edit message" onClick={onEdit}>
            <Pencil className={compact ? 'size-3' : 'size-3.5'} />
          </ActionButton>
        )}
        <ActionButton tooltip="Copy" onClick={handleCopy}>
          {isCopied ? (
            <Check className={compact ? 'size-3' : 'size-3.5'} />
          ) : (
            <Copy className={compact ? 'size-3' : 'size-3.5'} />
          )}
        </ActionButton>
      </div>
    );
  }

  // Assistant messages: Copy + Regenerate + Vote
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 opacity-0 group-hover/message:opacity-100 transition-opacity',
        compact ? 'mt-1' : 'mt-1.5'
      )}
    >
      <ActionButton tooltip="Copy" onClick={handleCopy}>
        {isCopied ? (
          <Check className={compact ? 'size-3' : 'size-3.5'} />
        ) : (
          <Copy className={compact ? 'size-3' : 'size-3.5'} />
        )}
      </ActionButton>

      {onRegenerate && (
        <ActionButton tooltip="Regenerate" onClick={onRegenerate}>
          <RotateCcw className={compact ? 'size-3' : 'size-3.5'} />
        </ActionButton>
      )}

      <ActionButton
        tooltip="Good response"
        onClick={handleUpvote}
        disabled={vote?.isUpvoted}
        className={vote?.isUpvoted ? 'text-green-500' : undefined}
      >
        <ThumbsUp className={compact ? 'size-3' : 'size-3.5'} />
      </ActionButton>

      <ActionButton
        tooltip="Bad response"
        onClick={handleDownvote}
        disabled={vote !== undefined && !vote.isUpvoted}
        className={vote !== undefined && !vote.isUpvoted ? 'text-red-500' : undefined}
      >
        <ThumbsDown className={compact ? 'size-3' : 'size-3.5'} />
      </ActionButton>
    </div>
  );
}

export const MessageActions = memo(PureMessageActions, (prevProps, nextProps) => {
  if (prevProps.vote?.isUpvoted !== nextProps.vote?.isUpvoted) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.messageContent !== nextProps.messageContent) return false;
  return true;
});

