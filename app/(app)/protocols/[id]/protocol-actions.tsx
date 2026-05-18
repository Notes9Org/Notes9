"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { DeleteProtocolDialog } from './delete-protocol-dialog'

interface ProtocolActionsProps {
  protocol: {
    id: string
    name: string
    experiment_protocols?: unknown[]
  }
  usageCount?: number
}

export function ProtocolActions({ protocol, usageCount }: ProtocolActionsProps) {
  const resolvedUsage = usageCount ?? protocol.experiment_protocols?.length ?? 0
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <DeleteProtocolDialog 
                protocolId={protocol.id} 
                protocolName={protocol.name}
                usageCount={resolvedUsage}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Delete</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
