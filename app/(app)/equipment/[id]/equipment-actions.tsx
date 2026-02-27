"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { EditEquipmentDialog } from './edit-equipment-dialog'
import { DeleteEquipmentDialog } from './delete-equipment-dialog'

export function EquipmentActions({ equipment }: { equipment: any }) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <EditEquipmentDialog equipment={equipment} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <DeleteEquipmentDialog 
                equipmentId={equipment.id} 
                equipmentName={equipment.name}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">Delete</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

