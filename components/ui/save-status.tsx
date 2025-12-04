import { Check, Cloud, CloudOff, Loader2 } from "lucide-react"
import { SaveStatus } from "@/hooks/use-auto-save"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SaveStatusIndicatorProps {
  status: SaveStatus
  lastSaved?: Date | null
  className?: string
  variant?: 'button' | 'inline'
}

export function SaveStatusIndicator({
  status,
  lastSaved,
  className,
  variant = 'button',
}: SaveStatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'saved':
        return {
          icon: Check,
          // text: 'Saved',
          detail: lastSaved ? `Last saved ${formatTimeAgo(lastSaved)}` : 'All changes saved',
          className: 'text-green-600 dark:text-green-400',
          bgClassName: 'bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50',
        }
      case 'saving':
        return {
          icon: Loader2,
          // text: 'Saving...',
          detail: 'Saving changes to cloud',
          className: 'text-blue-600 dark:text-blue-400',
          bgClassName: 'bg-blue-50 dark:bg-blue-950/30',
          animate: true,
        }
      case 'unsaved':
        return {
          icon: Cloud,
          // text: 'Unsaved',
          detail: 'Changes will be saved automatically',
          className: 'text-yellow-600 dark:text-yellow-400',
          bgClassName: 'bg-yellow-50 dark:bg-yellow-950/30 hover:bg-yellow-100 dark:hover:bg-yellow-950/50',
        }
      case 'error':
        return {
          icon: CloudOff,
          // text: 'Not saved',
          detail: 'Unable to save. Will retry automatically.',
          className: 'text-red-600 dark:text-red-400',
          bgClassName: 'bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50',
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium transition-colors',
          config.className,
          className
        )}
      >
        <Icon
          className={cn('h-3.5 w-3.5', config.animate && 'animate-spin')}
        />
        <span>{config.text}</span>
      </div>
    )
  }

  // Google Drive style button
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'flex items-center gap-2 px-3 h-9 transition-all',
              config.bgClassName,
              config.className,
              'border border-transparent hover:border-current/20',
              className
            )}
            disabled={status === 'saving'}
          >
            <Icon
              className={cn('h-4 w-4', config.animate && 'animate-spin')}
            />
            <span className="text-xs font-medium">{config.text}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-sm">{config.detail}</p>
          {status === 'saved' && lastSaved && (
            <p className="text-xs text-muted-foreground mt-1">
              {lastSaved.toLocaleString()}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)

  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

