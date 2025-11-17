"use client"

import { EditEquipmentDialog } from './edit-equipment-dialog'
import { DeleteEquipmentDialog } from './delete-equipment-dialog'

export function EquipmentActions({ equipment }: { equipment: any }) {
  return (
    <div className="flex gap-2">
      <EditEquipmentDialog equipment={equipment} />
      <DeleteEquipmentDialog 
        equipmentId={equipment.id} 
        equipmentName={equipment.name}
      />
    </div>
  )
}

