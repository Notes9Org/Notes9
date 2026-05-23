'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface ConnectionStatusProps {
  status: 'connecting' | 'connected' | 'disconnected'
}

const statusConfig = {
  connected: {
    dotClass: 'bg-green-500',
    label: 'Collaboration active',
  },
  connecting: {
    dotClass: 'bg-yellow-500 animate-pulse',
    label: 'Reconnecting...',
  },
  disconnected: {
    dotClass: 'bg-red-500',
    label: 'Collaboration unavailable',
  },
} as const

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const config = statusConfig[status]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex items-center justify-center p-1 cursor-default"
          aria-label={config.label}
          role="status"
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${config.dotClass}`} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {config.label}
      </TooltipContent>
    </Tooltip>
  )
}
