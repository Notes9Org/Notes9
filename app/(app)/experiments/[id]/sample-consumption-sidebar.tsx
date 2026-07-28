"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { FlaskConical, History, Loader2, Plus, Trash2, X, AlertCircle } from "lucide-react"

export interface SampleItem {
  id: string
  sample_code: string
  sample_type?: string | null
  quantity?: number | null
  quantity_unit?: string | null
  status?: string | null
}

interface SampleConsumptionSidebarProps {
  noteId: string
  noteTitle: string
  samples: SampleItem[]
  onQuantityUpdated: () => void | Promise<void>
}

interface LoggedConsumption {
  id: string
  sample_id: string
  sample_code: string
  quantity: number
  quantity_unit: string
  transferred_at: string
  notes: string
}

export function SampleConsumptionSidebar({
  noteId,
  noteTitle,
  samples,
  onQuantityUpdated,
}: SampleConsumptionSidebarProps) {
  const { toast } = useToast()
  const [monitoredSampleIds, setMonitoredSampleIds] = useState<string[]>([])
  const [deductions, setDeductions] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [consumptions, setConsumptions] = useState<LoggedConsumption[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Filter out depleted/disposed samples from the main drop-down selection
  const activeSamples = samples.filter(s => s.status !== "depleted" && s.status !== "disposed")

  // Load samples currently linked to this note to pre-populate the monitoring list
  useEffect(() => {
    async function loadLinkedSamples() {
      if (!noteId) return
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("sample_lab_notes")
          .select("sample_id")
          .eq("lab_note_id", noteId)

        if (error) throw error
        if (data && data.length > 0) {
          const ids = data.map((r: any) => r.sample_id)
          setMonitoredSampleIds(prev => Array.from(new Set([...prev, ...ids])))
        }
      } catch (err) {
        console.error("Error loading linked samples:", err)
      }
    }
    loadLinkedSamples()
  }, [noteId])

  // Fetch logged consumptions for this note
  const fetchConsumptions = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("sample_transfers")
        .select(`
          id,
          sample_id,
          quantity,
          quantity_unit,
          transferred_at,
          notes,
          sample:samples(sample_code)
        `)
        .eq("action", "reagent_use")
        .like("notes", `%[Note: ${noteId}]%`)
        .order("transferred_at", { ascending: false })

      if (error) throw error

      const formatted = (data || []).map((t: any) => ({
        id: t.id,
        sample_id: t.sample_id,
        sample_code: t.sample?.sample_code || "Unknown",
        quantity: Math.abs(Number(t.quantity || 0)),
        quantity_unit: t.quantity_unit || "",
        transferred_at: t.transferred_at,
        notes: t.notes || "",
      }))

      setConsumptions(formatted)
    } catch (err) {
      console.error("Error loading note sample consumptions:", err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [noteId])

  useEffect(() => {
    if (noteId) {
      fetchConsumptions()
    }
  }, [noteId, fetchConsumptions])

  // Add a sample to the active monitoring grid
  const handleAddToMonitoring = (sampleId: string) => {
    if (!sampleId) return
    setMonitoredSampleIds(prev => {
      if (prev.includes(sampleId)) return prev
      return [...prev, sampleId]
    })
    // Auto-link the sample in the DB
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from("sample_lab_notes")
          .insert({ sample_id: sampleId, lab_note_id: noteId, linked_by: user.id })
          .onConflict("sample_id, lab_note_id")
          .ignore()
          .then(() => {
            // refresh parent
            onQuantityUpdated()
          })
      }
    })
    setSearchQuery("")
  }

  // Remove sample from local monitoring list (does not delete stock, just cleans up UI link if no transfers exist)
  const handleRemoveFromMonitoring = async (sampleId: string) => {
    setMonitoredSampleIds(prev => prev.filter(id => id !== sampleId))
    
    // Clean up sample_lab_notes link in DB if no transfers are recorded for it in this note
    try {
      const supabase = createClient()
      const { count } = await supabase
        .from("sample_transfers")
        .select("id", { count: "exact", head: true })
        .eq("sample_id", sampleId)
        .like("notes", `%[Note: ${noteId}]%`)

      if (count === 0) {
        await supabase
          .from("sample_lab_notes")
          .delete()
          .eq("sample_id", sampleId)
          .eq("lab_note_id", noteId)
      }
    } catch (err) {
      console.error("Error cleaning up sample link:", err)
    }
  }

  // Handle deduction change in the table input
  const handleDeductionChange = (sampleId: string, val: string) => {
    setDeductions(prev => ({
      ...prev,
      [sampleId]: val
    }))
  }

  // Submit batch deductions
  const handleBatchDeductions = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Filter active deductions
    const activeDeductions = Object.entries(deductions)
      .map(([sampleId, value]) => ({
        sampleId,
        amount: Number(value),
        sample: samples.find(s => s.id === sampleId)
      }))
      .filter(item => item.amount > 0 && !isNaN(item.amount) && item.sample)

    if (activeDeductions.length === 0) {
      toast({
        title: "No inputs",
        description: "Please enter deduction quantities in the table below.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const timestamp = new Date().toISOString()

      // Log deductions sequentially or in parallel
      for (const item of activeDeductions) {
        const { sampleId, amount, sample } = item
        if (!sample) continue

        // Fetch fresh quantity
        const { data: sampleData } = await supabase
          .from("samples")
          .select("quantity, status")
          .eq("id", sampleId)
          .single()

        const currentQty = Number(sampleData?.quantity || 0)
        const newQty = Math.max(0, currentQty - amount)
        const newStatus = newQty <= 0 ? "depleted" : (sampleData?.status || "available")

        // 1. Update Sample stock level
        const { error: updateError } = await supabase
          .from("samples")
          .update({
            quantity: newQty,
            status: newStatus,
            updated_at: timestamp
          })
          .eq("id", sampleId)

        if (updateError) throw updateError

        // 2. Log Transfer transaction record
        const { error: transferError } = await supabase
          .from("sample_transfers")
          .insert({
            sample_id: sampleId,
            action: "reagent_use",
            quantity: -amount,
            quantity_unit: sample.quantity_unit || "μL",
            notes: `[Note: ${noteId}] Used in lab note: "${noteTitle}"`,
            performed_by: user.id,
            transferred_at: timestamp
          })

        if (transferError) throw transferError

        // 3. Make sure sample is linked to note
        await supabase
          .from("sample_lab_notes")
          .insert({
            sample_id: sampleId,
            lab_note_id: noteId,
            linked_by: user.id
          })
          .onConflict("sample_id, lab_note_id")
          .ignore()
      }

      toast({
        title: "Batch Deductions Logged",
        description: `Successfully logged stock adjustments for ${activeDeductions.length} samples.`,
      })

      // Reset fields
      setDeductions({})
      
      // Refresh
      await Promise.all([
        fetchConsumptions(),
        onQuantityUpdated()
      ])
    } catch (err: any) {
      console.error(err)
      toast({
        title: "Batch update failed",
        description: err.message || "An unexpected error occurred during database writes.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete/Revert logged consumption
  const handleDeleteConsumption = async (log: LoggedConsumption) => {
    setIsDeleting(log.id)
    try {
      const supabase = createClient()
      
      const { data: sampleData } = await supabase
        .from("samples")
        .select("quantity, status")
        .eq("id", log.sample_id)
        .single()

      const currentQty = Number(sampleData?.quantity || 0)
      const newQty = currentQty + log.quantity
      const newStatus = sampleData?.status === "depleted" && newQty > 0 ? "available" : sampleData?.status

      // Update Sample stock level
      const { error: updateError } = await supabase
        .from("samples")
        .update({
          quantity: newQty,
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", log.sample_id)

      if (updateError) throw updateError

      // Delete Transfer Record
      const { error: deleteError } = await supabase
        .from("sample_transfers")
        .delete()
        .eq("id", log.id)

      if (deleteError) throw deleteError

      // Clean up link if empty
      const { count } = await supabase
        .from("sample_transfers")
        .select("id", { count: "exact", head: true })
        .eq("sample_id", log.sample_id)
        .like("notes", `%[Note: ${noteId}]%`)

      if (count === 0) {
        await supabase
          .from("sample_lab_notes")
          .delete()
          .eq("sample_id", log.sample_id)
          .eq("lab_note_id", noteId)
      }

      toast({
        title: "Consumption Reverted",
        description: `Returned ${log.quantity} ${log.quantity_unit} back to sample ${log.sample_code}.`,
      })

      // Refresh
      await Promise.all([
        fetchConsumptions(),
        onQuantityUpdated()
      ])
    } catch (err: any) {
      console.error(err)
      toast({
        title: "Revert Failed",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(null)
    }
  }

  // Get current list of monitored samples objects
  const monitoredSamples = samples.filter(s => monitoredSampleIds.includes(s.id))

  // Suggestions list for search: items not yet monitored
  const unmonitoredSamples = activeSamples.filter(s => !monitoredSampleIds.includes(s.id))

  return (
    <div className="w-full lg:w-96 shrink-0 border rounded-xl bg-card text-card-foreground shadow-sm flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-muted/20 shrink-0 flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold text-sm leading-none">Sample Monitoring & Tracking</h3>
          <p className="text-2xs text-muted-foreground mt-0.5">Monitor and deduct quantities at scale</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* Dropdown to add samples to the monitoring table */}
        <div className="space-y-1.5">
          <Label htmlFor="monitor-search" className="text-xs">Add Sample to Monitor Grid</Label>
          <Select value={searchQuery} onValueChange={handleAddToMonitoring}>
            <SelectTrigger id="monitor-search" className="h-9 text-xs">
              <SelectValue placeholder="Search or select sample..." />
            </SelectTrigger>
            <SelectContent className="max-h-[200px]">
              {unmonitoredSamples.length > 0 ? (
                unmonitoredSamples.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.sample_code} ({s.quantity != null ? `${s.quantity} ${s.quantity_unit || ""}` : "Unspecified"})
                  </SelectItem>
                ))
              ) : (
                <div className="p-2 text-center text-xs text-muted-foreground">All active samples are in the monitoring list</div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Monitoring grid / table */}
        <form onSubmit={handleBatchDeductions} className="space-y-3">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5 shrink-0">
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            Monitored Samples Stock levels
          </h4>

          {monitoredSamples.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <AlertCircle className="h-6 w-6 text-muted-foreground/60" />
              <span>No samples are currently being monitored. Add a sample above or tag one in your notes using "$" to populate this grid.</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="border rounded-lg overflow-hidden bg-card">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-3xs h-8 py-0 font-semibold">Sample Code</TableHead>
                      <TableHead className="text-3xs h-8 py-0 text-right font-semibold">Stock</TableHead>
                      <TableHead className="text-3xs h-8 py-0 text-center font-semibold w-24">Deduct Qty</TableHead>
                      <TableHead className="text-3xs h-8 py-0 w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monitoredSamples.map(s => (
                      <TableRow key={s.id} className="hover:bg-muted/10 h-10">
                        <TableCell className="text-2xs font-mono font-medium py-1">{s.sample_code}</TableCell>
                        <TableCell className="text-2xs py-1 text-right whitespace-nowrap">
                          {s.status === "depleted" ? (
                            <span className="text-destructive font-semibold">Depleted</span>
                          ) : (
                            <span>{s.quantity ?? 0} {s.quantity_unit || ""}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1 text-center">
                          <div className="inline-flex items-center gap-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              disabled={s.status === "depleted" || isSubmitting}
                              placeholder="0"
                              value={deductions[s.id] || ""}
                              onChange={e => handleDeductionChange(s.id, e.target.value)}
                              className="h-7 w-16 text-xs px-1 text-center font-semibold border-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-primary"
                            />
                            <span className="text-3xs text-muted-foreground font-mono">{s.quantity_unit || "qty"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Remove from monitoring list"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleRemoveFromMonitoring(s.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button
                type="submit"
                size="sm"
                className="w-full text-xs h-9"
                disabled={isSubmitting || monitoredSamples.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving batch deductions...
                  </>
                ) : (
                  <>
                    <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
                    Log Batch Deductions
                  </>
                )}
              </Button>
            </div>
          )}
        </form>

        <hr className="border-border/60" />

        {/* History of logged consumptions */}
        <div className="space-y-2 min-h-0 flex-1 flex flex-col">
          <h4 className="text-xs font-semibold flex items-center gap-1.5 text-foreground shrink-0">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            Consumption History
          </h4>

          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : consumptions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-2xs text-muted-foreground">
              No sample logs recorded for this note yet. Use the grid above to deduct stocks.
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden bg-card shrink-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-3xs h-8 py-0">Sample</TableHead>
                    <TableHead className="text-3xs h-8 py-0 text-right">Used</TableHead>
                    <TableHead className="text-3xs h-8 py-0 w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumptions.map(log => (
                    <TableRow key={log.id} className="hover:bg-muted/10 h-9">
                      <TableCell className="text-2xs font-medium py-1 font-mono">{log.sample_code}</TableCell>
                      <TableCell className="text-2xs py-1 text-right text-destructive font-semibold">
                        -{log.quantity} {log.quantity_unit}
                      </TableCell>
                      <TableCell className="py-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isDeleting === log.id}
                          className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteConsumption(log)}
                          title="Revert consumption"
                        >
                          {isDeleting === log.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
