"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { fetchOrganizationIdForExperiment } from "@/lib/experiment-storage"
import { USER_STORAGE_BUCKET, createExperimentDataStoragePath } from "@/lib/user-storage-bucket"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChartLine, CircleNotch } from "@phosphor-icons/react/ssr"

type Option = { id: string; name: string }
type ExperimentOption = Option & { project_id: string | null }

/**
 * Save the current chart as a PNG into an experiment's data files (the same
 * store the Data files browser lists). Needs a target experiment because
 * experiment_data.experiment_id is NOT NULL, so we prompt for project →
 * experiment, then upload + insert the row exactly like the upload dialog.
 */
export function SaveChartDialog({
  open,
  onOpenChange,
  projects,
  experiments,
  defaultName,
  getPng,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  projects: Option[]
  experiments: ExperimentOption[]
  defaultName: string
  getPng: () => Promise<string | null>
  onSaved?: () => void
}) {
  const user = useAuthUser()
  const [projectId, setProjectId] = useState<string>("")
  const [experimentId, setExperimentId] = useState<string>("")
  const [fileName, setFileName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setFileName(`${(defaultName || "chart").replace(/\s+/g, "-").toLowerCase()}.png`)
  }, [open, defaultName])

  const experimentOptions = useMemo(
    () => (projectId ? experiments.filter((e) => e.project_id === projectId) : experiments),
    [experiments, projectId],
  )

  const save = async () => {
    if (!experimentId || !user) return
    setSaving(true)
    try {
      const dataUrl = await getPng()
      if (!dataUrl) throw new Error("Couldn't render the chart image")
      const blob = await (await fetch(dataUrl)).blob()
      const name = fileName.trim() || "chart.png"

      const supabase = createClient()
      const organizationId = await fetchOrganizationIdForExperiment(supabase, experimentId)
      if (!organizationId) throw new Error("Could not resolve organization for this experiment")

      const dataFileId = crypto.randomUUID()
      const storagePath = createExperimentDataStoragePath(organizationId, experimentId, dataFileId, name)

      const { error: uploadError } = await supabase.storage
        .from(USER_STORAGE_BUCKET)
        .upload(storagePath, blob, { cacheControl: "3600", upsert: false, contentType: "image/png" })
      if (uploadError) throw uploadError

      const { error: dbError } = await supabase.from("experiment_data").insert({
        id: dataFileId,
        experiment_id: experimentId,
        project_id: projectId || null,
        data_type: "visualization",
        file_name: name,
        file_url: storagePath,
        file_size: blob.size,
        file_type: "image/png",
        uploaded_by: user.id,
        metadata: { original_name: name, upload_date: new Date().toISOString(), storage_path: storagePath, source: "data-analysis-chart" },
      })
      if (dbError) {
        try {
          await supabase.storage.from(USER_STORAGE_BUCKET).remove([storagePath])
        } catch {
          /* best-effort cleanup */
        }
        throw dbError
      }

      toast.success(`Saved “${name}” to your data files`)
      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save chart")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChartLine className="h-4 w-4 text-[var(--n9-accent,#965034)]" /> Save chart to data files
          </DialogTitle>
          <DialogDescription>Saves the current chart as a PNG into an experiment&rsquo;s data files, browsable across your lab.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="save-chart-project">Project (required)</Label>
            <Select value={projectId} onValueChange={(v) => { setProjectId(v); setExperimentId("") }}>
              <SelectTrigger id="save-chart-project"><SelectValue placeholder="Choose a project" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="save-chart-experiment">Experiment (required)</Label>
            <Select value={experimentId} onValueChange={setExperimentId} disabled={!projectId}>
              <SelectTrigger id="save-chart-experiment"><SelectValue placeholder={projectId ? "Choose an experiment" : "Choose a project first"} /></SelectTrigger>
              <SelectContent>
                {experimentOptions.map((e) => (<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Data files live inside an experiment — both are required.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="save-chart-name">File name</Label>
            <Input id="save-chart-name" value={fileName} onChange={(e) => setFileName(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!experimentId || saving}>
            {saving ? <><CircleNotch className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</> : "Save to library"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
