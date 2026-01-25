"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Plus, Loader2 } from "lucide-react"

interface Protocol {
  id: string
  name: string
  description: string | null
  version: string | null
}

interface LinkProtocolDialogProps {
  experimentId: string
  linkedProtocolIds: string[]
  children?: React.ReactNode
}

export function LinkProtocolDialog({ 
  experimentId, 
  linkedProtocolIds, 
  children 
}: LinkProtocolDialogProps) {
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [selectedProtocolId, setSelectedProtocolId] = useState<string>("")

  useEffect(() => {
    if (open) {
      fetchAvailableProtocols()
    }
  }, [open])

  const fetchAvailableProtocols = async () => {
    try {
      const { data, error } = await supabase
        .from("protocols")
        .select("id, name, description, version")
        .eq("is_active", true)
        .order("name")

      if (error) throw error

      // Filter out already linked protocols
      const availableProtocols = data?.filter(
        protocol => !linkedProtocolIds.includes(protocol.id)
      ) || []

      setProtocols(availableProtocols)
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch protocols",
        variant: "destructive",
      })
    }
  }

  const handleLinkProtocol = async () => {
    if (!selectedProtocolId) {
      toast({
        title: "Error",
        description: "Please select a protocol to link",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase
        .from("experiment_protocols")
        .insert({
          experiment_id: experimentId,
          protocol_id: selectedProtocolId,
        })

      if (error) throw error

      toast({
        title: "Success",
        description: "Protocol linked successfully",
      })

      setOpen(false)
      setSelectedProtocolId("")
      router.refresh()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to link protocol",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Link Protocol
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Link Protocol</DialogTitle>
          <DialogDescription>
            Select an existing protocol to link to this experiment.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="protocol">Protocol</Label>
            <Select
              value={selectedProtocolId}
              onValueChange={setSelectedProtocolId}
              disabled={isLoading}
            >
              <SelectTrigger id="protocol">
                <SelectValue placeholder="Select a protocol" />
              </SelectTrigger>
              <SelectContent>
                {protocols.length === 0 ? (
                  <SelectItem value="no-protocols" disabled>
                    No available protocols
                  </SelectItem>
                ) : (
                  protocols.map((protocol) => (
                    <SelectItem key={protocol.id} value={protocol.id}>
                      <div>
                        <div className="font-medium">{protocol.name}</div>
                        {protocol.description && (
                          <div className="text-xs text-muted-foreground truncate">
                            {protocol.description}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleLinkProtocol}
            disabled={isLoading || !selectedProtocolId || protocols.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Linking...
              </>
            ) : (
              "Link Protocol"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}