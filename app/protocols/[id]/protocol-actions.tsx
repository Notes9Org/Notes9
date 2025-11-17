"use client"

import { EditProtocolDialog } from './edit-protocol-dialog'
import { DeleteProtocolDialog } from './delete-protocol-dialog'

export function ProtocolActions({ protocol }: { protocol: any }) {
  return (
    <div className="flex gap-2">
      <EditProtocolDialog protocol={protocol} />
      <DeleteProtocolDialog 
        protocolId={protocol.id} 
        protocolName={protocol.name}
        usageCount={protocol.experiment_protocols?.length || 0}
      />
    </div>
  )
}

