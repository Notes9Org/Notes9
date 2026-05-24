"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
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
import { CheckCircle2, ClipboardCheck, Loader2, Plus, Trash2 } from "lucide-react"

export type SampleQcRecord = {
  id: string
  sample_id: string
  qc_type: string
  result: "pass" | "fail" | "inconclusive" | "pending"
  measured_value: string | null
  measured_unit: string | null
  expected_value: string | null
  notes: string | null
  attachment_path: string | null
  performed_at: string
  performed_by: string | null
  performer?: {
    id: string
    first_name: string | null
    last_name: string | null
  } | null
  created_at: string
  updated_at: string
}

type SampleQcTabProps = {
  sampleId: string
  initialRecords: SampleQcRecord[]
}

const QC_TYPE_OPTIONS = [
  "Concentration",
  "Purity (A260/A280)",
  "Purity (A260/A230)",
  "Gel electrophoresis",
  "Sequencing verification",
  "Sterility",
  "Viability",
  "Endotoxin",
  "pH",
  "Custom",
]

const RESULT_OPTIONS: { value: SampleQcRecord["result"]; label: string }[] = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "inconclusive", label: "Inconclusive" },
  { value: "pending", label: "Pending" },
]

function resultVariant(result: SampleQcRecord["result"]): "default" | "secondary" | "destructive" | "outline" {
  switch (result) {
    case "pass":
      return "default"
    case "fail":
      return "destructive"
    case "pending":
      return "secondary"
    default:
      return "outline"
  }
}

function performerName(record: SampleQcRecord) {
  const performer = record.performer
  if (!performer) return "—"
  const name = [performer.first_name, performer.last_name].filter(Boolean).join(" ").trim()
  return name || "—"
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatMeasurement(record: SampleQcRecord) {
  if (!record.measured_value) return null
  return `${record.measured_value}${record.measured_unit ? ` ${record.measured_unit}` : ""}`
}

export function SampleQcTab({ sampleId, initialRecords }: SampleQcTabProps) {
  const { toast } = useToast()
  const router = useRouter()
  const [records, setRecords] = useState<SampleQcRecord[]>(initialRecords)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<SampleQcRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form state.
  const [qcTypeChoice, setQcTypeChoice] = useState<string>("Concentration")
  const [qcTypeCustom, setQcTypeCustom] = useState("")
  const [result, setResult] = useState<SampleQcRecord["result"]>("pass")
  const [measuredValue, setMeasuredValue] = useState("")
  const [measuredUnit, setMeasuredUnit] = useState("")
  const [expectedValue, setExpectedValue] = useState("")
  const [notes, setNotes] = useState("")
  const [performedAt, setPerformedAt] = useState<string>(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })

  const resetForm = useCallback(() => {
    setQcTypeChoice("Concentration")
    setQcTypeCustom("")
    setResult("pass")
    setMeasuredValue("")
    setMeasuredUnit("")
    setExpectedValue("")
    setNotes("")
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    setPerformedAt(now.toISOString().slice(0, 16))
  }, [])

  const refreshRecords = useCallback(async () => {
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from("sample_qc_records")
      .select(
        `*, performer:profiles!sample_qc_records_performed_by_fkey(id, first_name, last_name)`
      )
      .eq("sample_id", sampleId)
      .order("performed_at", { ascending: false })
    if (fetchError) {
      setError(fetchError.message)
      return
    }
    setRecords((data ?? []) as SampleQcRecord[])
  }, [sampleId])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not signed in")

      const qcType =
        qcTypeChoice === "Custom" ? qcTypeCustom.trim() : qcTypeChoice
      if (!qcType) throw new Error("QC type is required.")

      const performedAtIso = new Date(performedAt).toISOString()

      const { error: insertError } = await supabase.from("sample_qc_records").insert({
        sample_id: sampleId,
        qc_type: qcType,
        result,
        measured_value: measuredValue.trim() || null,
        measured_unit: measuredUnit.trim() || null,
        expected_value: expectedValue.trim() || null,
        notes: notes.trim() || null,
        performed_at: performedAtIso,
        performed_by: user.id,
      })
      if (insertError) throw insertError

      toast({ title: "QC record added", description: `${qcType} – ${result.toUpperCase()}` })
      setOpen(false)
      resetForm()
      await refreshRecords()
      router.refresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Could not save QC record.")
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
        .from("sample_qc_records")
        .delete()
        .eq("id", pendingDelete.id)
      if (deleteError) throw deleteError
      setRecords((current) => current.filter((row) => row.id !== pendingDelete.id))
      toast({ title: "QC record removed" })
      router.refresh()
    } catch (err) {
      console.error(err)
      toast({
        title: "Could not delete record",
        description: err instanceof Error ? err.message : "Unexpected error.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  const passCount = records.filter((record) => record.result === "pass").length
  const failCount = records.filter((record) => record.result === "fail").length

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base text-foreground">Quality control</CardTitle>
            <CardDescription>
              Record QC measurements and verifications performed on this sample.
            </CardDescription>
            {records.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="default">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {passCount} pass
                </Badge>
                {failCount > 0 ? <Badge variant="destructive">{failCount} fail</Badge> : null}
                <Badge variant="outline">{records.length} total</Badge>
              </div>
            ) : null}
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
              Record QC
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record QC measurement</DialogTitle>
              <DialogDescription>
                Capture a quality control event with optional measured value and notes.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qc-type">QC type</Label>
                  <Select value={qcTypeChoice} onValueChange={setQcTypeChoice}>
                    <SelectTrigger id="qc-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QC_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {qcTypeChoice === "Custom" ? (
                    <Input
                      value={qcTypeCustom}
                      onChange={(event) => setQcTypeCustom(event.target.value)}
                      placeholder="Custom QC type"
                      required
                    />
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qc-result">Result</Label>
                  <Select
                    value={result}
                    onValueChange={(value) => setResult(value as SampleQcRecord["result"])}
                  >
                    <SelectTrigger id="qc-result">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESULT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <div className="space-y-1.5">
                  <Label htmlFor="qc-measured">Measured value</Label>
                  <Input
                    id="qc-measured"
                    value={measuredValue}
                    onChange={(event) => setMeasuredValue(event.target.value)}
                    placeholder="e.g. 250"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qc-unit">Unit</Label>
                  <Input
                    id="qc-unit"
                    value={measuredUnit}
                    onChange={(event) => setMeasuredUnit(event.target.value)}
                    placeholder="ng/μL"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qc-expected">Expected / target</Label>
                  <Input
                    id="qc-expected"
                    value={expectedValue}
                    onChange={(event) => setExpectedValue(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qc-when">Performed at</Label>
                  <Input
                    id="qc-when"
                    type="datetime-local"
                    value={performedAt}
                    onChange={(event) => setPerformedAt(event.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qc-notes">Notes</Label>
                <Textarea
                  id="qc-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional context, instrument, lot info"
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
                  Save record
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
        {records.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">No QC records yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Record concentration, purity, gel results, or any custom QC checks for this sample.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="whitespace-nowrap">Measured</TableHead>
                  <TableHead className="hidden md:table-cell">Expected</TableHead>
                  <TableHead>Performed by</TableHead>
                  <TableHead className="hidden lg:table-cell">Notes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const measured = formatMeasurement(record)
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(record.performed_at)}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{record.qc_type}</TableCell>
                      <TableCell>
                        <Badge variant={resultVariant(record.result)}>
                          {record.result}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-foreground">
                        {measured || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {record.expected_value || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{performerName(record)}</TableCell>
                      <TableCell className="hidden max-w-xs lg:table-cell">
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {record.notes || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setPendingDelete(record)}
                          aria-label="Delete QC record"
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
            <AlertDialogTitle>Delete QC record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {pendingDelete ? pendingDelete.qc_type : "QC"} entry.
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
