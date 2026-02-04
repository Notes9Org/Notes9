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
import { Plus, Loader2 } from "lucide-react"

interface Protocol {
    id: string
    name: string
    description: string | null
    version: string | null
}

interface LinkNoteProtocolDialogProps {
    noteId: string
    linkedProtocolIds: string[]
    onLink?: () => void
    children?: React.ReactNode
}

export function LinkNoteProtocolDialog({
    noteId,
    linkedProtocolIds,
    onLink,
    children
}: LinkNoteProtocolDialogProps) {
    const { toast } = useToast()
    const supabase = createClient()

    const [open, setOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [protocols, setProtocols] = useState<Protocol[]>([])
    const [selectedProtocolId, setSelectedProtocolId] = useState<string>("")
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

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
                .from("lab_note_protocols")
                .insert({
                    lab_note_id: noteId,
                    protocol_id: selectedProtocolId,
                })

            if (error) throw error

            toast({
                title: "Success",
                description: "Protocol linked to note",
            })

            setOpen(false)
            setSelectedProtocolId("")
            onLink?.()
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

    // Prevent hydration mismatch
    if (!mounted) {
        return (
            <Button variant="ghost" size="sm" disabled className="h-6 px-2 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add Protocol
            </Button>
        )
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Add Protocol
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Link Protocol to Note</DialogTitle>
                    <DialogDescription>
                        Select a protocol to link to this lab note.
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
                                                {protocol.version && (
                                                    <span className="text-xs text-muted-foreground ml-1">
                                                        v{protocol.version}
                                                    </span>
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
