"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { EditProtocolDialog } from './edit-protocol-dialog'
import { DeleteProtocolDialog } from './delete-protocol-dialog'

export function ProtocolActions({ protocol }: { protocol: any }) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <EditProtocolDialog protocol={protocol} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <DeleteProtocolDialog 
                protocolId={protocol.id} 
                protocolName={protocol.name}
                usageCount={protocol.experiment_protocols?.length || 0}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Delete</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

