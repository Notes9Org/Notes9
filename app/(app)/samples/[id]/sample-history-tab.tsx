"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { ArrowRight, History, Loader2, Plus, Trash2 } from "lucide-react"

export type SampleTransfer = {
  id: string
  sample_id: string
  action: "transfer" | "check_in" | "check_out" | "aliquot" | "dispose" | "reagent_use"
  from_location: string | null
  to_location: string | null
  quantity: number | string | null
  quantity_unit: string | null
  notes: string | null
  transferred_at: string
  performed_by: string | null
  performer?: {
    id: string
    first_name: string | null
    last_name: string | null
  } | null
  created_at: string
  updated_at: string
}

type SampleHistoryTabProps = {
  sampleId: string
  initialTransfers: SampleTransfer[]
  currentLocation: string | null
}

const ACTION_OPTIONS: { value: SampleTransfer["action"]; label: string }[] = [
  { value: "transfer", label: "Transfer" },
  { value: "check_in", label: "Check in" },
  { value: "check_out", label: "Check out" },
  { value: "aliquot", label: "Aliquot" },
  { value: "reagent_use", label: "Reagent use" },
  { value: "dispose", label: "Dispose" },
]

const QUANTITY_UNITS = ["μL", "mL", "L", "μg", "mg", "g", "kg", "units", "items"]

function actionLabel(action: SampleTransfer["action"]) {
  return ACTION_OPTIONS.find((option) => option.value === action)?.label ?? action
}

function actionVariant(action: SampleTransfer["action"]): "default" | "secondary" | "outline" | "destructive" {
  switch (action) {
    case "dispose":
      return "destructive"
    case "transfer":
    case "check_out":
      return "default"
    case "check_in":
      return "secondary"
    default:
      return "outline"
  }
}

function performerName(transfer: SampleTransfer) {
  const performer = transfer.performer
  if (!performer) return "—"
  const name = [performer.first_name, performer.last_name].filter(Boolean).join(" ").trim()
  return name || "—"
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatQuantity(transfer: SampleTransfer) {
  if (transfer.quantity == null) return null
  const value = typeof transfer.quantity === "number" ? transfer.quantity : Number(transfer.quantity)
  const num = Number.isFinite(value) ? value : transfer.quantity
  return `${num}${transfer.quantity_unit ? ` ${transfer.quantity_unit}` : ""}`
}

export function SampleHistoryTab({ sampleId, initialTransfers, currentLocation }: SampleHistoryTabProps) {
  const user = useAuthUser();
  const { toast } = useToast()
  const router = useRouter()
  const [transfers, setTransfers] = useState<SampleTransfer[]>(initialTransfers)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<SampleTransfer | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form state.
  const [action, setAction] = useState<SampleTransfer["action"]>("transfer")
  const [fromLocation, setFromLocation] = useState(currentLocation ?? "")
  const [toLocation, setToLocation] = useState("")
  const [quantity, setQuantity] = useState("")
  const [quantityUnit, setQuantityUnit] = useState("μL")
  const [notes, setNotes] = useState("")
  const [transferredAt, setTransferredAt] = useState<string>(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })

  const resetForm = useCallback(() => {
    setAction("transfer")
    setFromLocation(currentLocation ?? "")
    setToLocation("")
    setQuantity("")
    setQuantityUnit("μL")
    setNotes("")
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    setTransferredAt(now.toISOString().slice(0, 16))
  }, [currentLocation])

  const refreshTransfers = useCallback(async () => {
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from("sample_transfers")
      .select(
        `*, performer:profiles!sample_transfers_performed_by_fkey(id, first_name, last_name)`
      )
      .eq("sample_id", sampleId)
      .order("transferred_at", { ascending: false })
    if (fetchError) {
      setError(fetchError.message)
      return
    }
    setTransfers((data ?? []) as SampleTransfer[])
  }, [sampleId])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      if (!user) throw new Error("Not signed in")

      const trimmedQuantity = quantity.trim()
      const numericQuantity = trimmedQuantity ? Number(trimmedQuantity) : null
      if (trimmedQuantity && (numericQuantity == null || Number.isNaN(numericQuantity))) {
        throw new Error("Quantity must be a number.")
      }

      const transferredAtIso = new Date(transferredAt).toISOString()

      const { error: insertError } = await supabase.from("sample_transfers").insert({
        sample_id: sampleId,
        action,
        from_location: fromLocation.trim() || null,
        to_location: toLocation.trim() || null,
        quantity: numericQuantity,
        quantity_unit: trimmedQuantity ? quantityUnit : null,
        notes: notes.trim() || null,
        transferred_at: transferredAtIso,
        performed_by: user.id,
      })
      if (insertError) throw insertError

      toast({ title: "History entry added", description: `${actionLabel(action)} recorded.` })
      setOpen(false)
      resetForm()
      await refreshTransfers()
      router.refresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Could not save history entry.")
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const supabase = createClient()
      const { error: deleteError } = await supabase
        .from("sample_transfers")
        .delete()
        .eq("id", pendingDelete.id)
      if (deleteError) throw deleteError
      setTransfers((current) => current.filter((row) => row.id !== pendingDelete.id))
      toast({ title: "Entry removed" })
      router.refresh()
    } catch (err) {
      console.error(err)
      toast({
        title: "Could not delete entry",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
            <History className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base text-foreground">Sample history</CardTitle>
            <CardDescription>
              Track transfers, check-ins/outs, aliquots, and disposals for this sample.
            </CardDescription>
          </div>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) {
              resetForm()
              setError(null)
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="self-start sm:self-auto">
              <Plus className="mr-1 h-4 w-4" />
              Add entry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add history entry</DialogTitle>
              <DialogDescription>
                Log a transfer, check-in/out, aliquot, or disposal event for this sample.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-action">Action</Label>
                  <Select value={action} onValueChange={(value) => setAction(value as SampleTransfer["action"])}>
                    <SelectTrigger id="transfer-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-when">When</Label>
                  <Input
                    id="transfer-when"
                    type="datetime-local"
                    value={transferredAt}
                    onChange={(event) => setTransferredAt(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-from">From location</Label>
                  <Input
                    id="transfer-from"
                    value={fromLocation}
                    onChange={(event) => setFromLocation(event.target.value)}
                    placeholder="e.g. -80°C freezer A, shelf 2"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-to">To location</Label>
                  <Input
                    id="transfer-to"
                    value={toLocation}
                    onChange={(event) => setToLocation(event.target.value)}
                    placeholder="e.g. Bench rack, recipient name"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-quantity">Quantity</Label>
                  <Input
                    id="transfer-quantity"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-unit">Unit</Label>
                  <Select value={quantityUnit} onValueChange={setQuantityUnit}>
                    <SelectTrigger id="transfer-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUANTITY_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="transfer-notes">Notes</Label>
                <Textarea
                  id="transfer-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional context for this event"
                  rows={3}
                />
              </div>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Save entry
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {error && !open ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {transfers.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No history yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add the first transfer or check-in/out to start tracking sample movement.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead className="whitespace-nowrap">Quantity</TableHead>
                  <TableHead>Performed by</TableHead>
                  <TableHead className="hidden lg:table-cell">Notes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((transfer) => {
                  const movement = (
                    <div className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                      <span className="truncate text-muted-foreground">
                        {transfer.from_location || "—"}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{transfer.to_location || "—"}</span>
                    </div>
                  )
                  const qty = formatQuantity(transfer)
                  return (
                    <TableRow key={transfer.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(transfer.transferred_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(transfer.action)}>
                          {actionLabel(transfer.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-[160px] max-w-[240px]">{movement}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-foreground">
                        {qty || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{performerName(transfer)}</TableCell>
                      <TableCell className="hidden max-w-xs lg:table-cell">
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {transfer.notes || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setPendingDelete(transfer)}
                          aria-label="Delete entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete history entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {pendingDelete ? actionLabel(pendingDelete.action).toLowerCase() : "history"} entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                confirmDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
