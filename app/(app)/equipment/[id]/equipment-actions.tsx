"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { EditEquipmentDialog } from './edit-equipment-dialog'
import { DeleteEquipmentDialog } from './delete-equipment-dialog'

interface EquipmentActionsItem {
  id: string
  name: string
  equipment_code: string
  category?: string | null
  model?: string | null
  manufacturer?: string | null
  serial_number?: string | null
  location?: string | null
  status: string
  next_maintenance_date?: string | null
  purchase_date?: string | null
  notes?: string | null
}

export function EquipmentActions({ equipment }: { equipment: EquipmentActionsItem }) {
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

