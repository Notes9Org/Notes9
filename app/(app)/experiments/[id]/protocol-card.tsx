"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

interface ProtocolCardProps {
  protocolLink: {
    id: string
    added_at: string
    protocol: {
      id: string
      name: string
      description: string | null
      version: string | null
    }
  }
}

export function ProtocolCard({ protocolLink }: ProtocolCardProps) {
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
            <CardTitle className="text-foreground">{protocolLink.protocol.name}</CardTitle>
            <CardDescription>
              Version {protocolLink.protocol.version || "1.0"} • Added {new Date(protocolLink.added_at).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/protocols/${protocolLink.protocol.id}`}>
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
      {protocolLink.protocol.description && (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {protocolLink.protocol.description}
          </p>
        </CardContent>
      )}
    </Card>
  )
}