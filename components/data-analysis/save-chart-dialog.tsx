"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { fetchOrganizationIdForExperiment } from "@/lib/experiment-storage"
import { USER_STORAGE_BUCKET, createExperimentDataStoragePath } from "@/lib/user-storage-bucket"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CaretDown, ChartLine, CircleNotch } from "@phosphor-icons/react/ssr"

/** Native <select> styled to match the workspace — no shadcn. */
function NativeSelect({ value, onChange, disabled, id, children }: { value: string; onChange: (v: string) => void; disabled?: boolean; id?: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-8 text-sm outline-none transition-colors hover:border-border focus:border-[var(--n9-accent,#965034)]/50 focus:ring-2 focus:ring-[var(--n9-accent,#965034)]/20",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {children}
      </select>
      <CaretDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

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
            <NativeSelect id="save-chart-project" value={projectId} onChange={(v) => { setProjectId(v); setExperimentId("") }}>
              <option value="" disabled>Choose a project</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="save-chart-experiment">Experiment (required)</Label>
            <NativeSelect id="save-chart-experiment" value={experimentId} onChange={setExperimentId} disabled={!projectId}>
              <option value="" disabled>{projectId ? "Choose an experiment" : "Choose a project first"}</option>
              {experimentOptions.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
            </NativeSelect>
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
