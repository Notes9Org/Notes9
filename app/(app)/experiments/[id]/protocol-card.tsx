"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Loader2 } from "lucide-react"
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

interface ProtocolCardProps {
  protocolLink: {
    id: string
    added_at?: string | null
    protocol: ProtocolRef | ProtocolRef[]
  }
}

export function ProtocolCard({ protocolLink }: ProtocolCardProps) {
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground">{protocol.name}</CardTitle>
            <CardDescription>
              Version {protocol.version || "1.0"}
              {protocolLink.added_at ? ` • Added ${new Date(protocolLink.added_at).toISOString().slice(0, 10)}` : ""}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/protocols/${protocol.id}`}>
                <FileText className="h-4 w-4 mr-2" />
                View Protocol
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUnlink}
              disabled={isUnlinking}
            >
              {isUnlinking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Unlinking...
                </>
              ) : (
                "Unlink"
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      {protocol.description && (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {protocol.description}
          </p>
        </CardContent>
      )}
    </Card>
  )
}