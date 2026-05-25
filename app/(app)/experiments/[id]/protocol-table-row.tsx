"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { TableRow, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { FileText, Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

interface ProtocolRef {
  id: string
  name: string
  description?: string | null
  version?: string | null
  [key: string]: unknown
}

interface ProtocolTableRowProps {
  protocolLink: {
    id: string
    added_at?: string | null
    protocol: ProtocolRef | ProtocolRef[]
  }
}

export function ProtocolTableRow({ protocolLink }: ProtocolTableRowProps) {
  const protocol = Array.isArray(protocolLink.protocol)
    ? protocolLink.protocol[0]
    : protocolLink.protocol
  const [isUnlinking, setIsUnlinking] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleUnlink = async () => {
    setIsUnlinking(true)
    
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("experiment_protocols")
        .delete()
        .eq("id", protocolLink.id)
      
      if (error) throw error

      toast({
        title: "Success",
        description: "Protocol unlinked successfully",
      })

      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to unlink protocol",
        variant: "destructive",
      })
    } finally {
      setIsUnlinking(false)
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {protocol.name}
        {protocol.description && (
          <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {protocol.description}
          </div>
        )}
      </TableCell>
      <TableCell>{protocol.version || "1.0"}</TableCell>
      <TableCell>
        {protocolLink.added_at ? new Date(protocolLink.added_at).toISOString().slice(0, 10) : "—"}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/protocols/${protocol.id}`}>
              <FileText className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnlink}
            disabled={isUnlinking}
          >
            {isUnlinking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}