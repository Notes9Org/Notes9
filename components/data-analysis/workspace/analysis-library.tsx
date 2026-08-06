"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowCounterClockwise,
  CaretDown,
  CircleNotch,
  DownloadSimple,
  FloppyDisk,
  Lock,
  LockOpen,
} from "@phosphor-icons/react/ssr"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { AnalysisRevision, SavedAnalysis } from "@/lib/data-analysis/saved-analysis"

type Option = { id: string; name: string }
type ExperimentOption = Option & { project_id: string | null }

/** Native <select>, matching SaveChartDialog rather than pulling in shadcn. */
function NativeSelect({
  value,
  onChange,
  disabled,
  id,
  children,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  id?: string
  children: React.ReactNode
}) {
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

/**
 * Save (§3A.3 rule 1, the explicit half).
 *
 * Two shapes behind one dialog because they are one act at two moments: the
 * first save has to name the analysis and say where in the lab it belongs, and
 * every save after that only has to say what changed. Asking for the experiment
 * again on revision four would be asking a question whose answer cannot have
 * changed.
 *
 * The experiment is optional on purpose. An analysis of a file dragged onto the
 * page still has to be savable, or the researcher learns to keep work in
 * downloads, which is exactly the habit §3A exists to end.
 */
export function SaveAnalysisDialog({
  open,
  onOpenChange,
  mode,
  defaultName,
  projects,
  experiments,
  saving,
  frozenRevisionNo,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: "create" | "revision"
  defaultName: string
  projects: Option[]
  experiments: ExperimentOption[]
  saving: boolean
  /** Set when the revision on screen is frozen, so the fork is stated up front. */
  frozenRevisionNo?: number | null
  onSave: (input: { name: string; experimentId: string | null; changeSummary: string }) => void
}) {
  const [name, setName] = useState("")
  const [projectId, setProjectId] = useState("")
  const [experimentId, setExperimentId] = useState("")
  const [changeSummary, setChangeSummary] = useState("")

  useEffect(() => {
    if (!open) return
    setName(defaultName || "Untitled analysis")
    setChangeSummary("")
  }, [open, defaultName])

  const experimentOptions = useMemo(
    () => (projectId ? experiments.filter((e) => e.project_id === projectId) : experiments),
    [experiments, projectId],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FloppyDisk className="h-4 w-4 text-[var(--n9-accent,#965034)]" />
            {mode === "create" ? "Save this analysis" : "Save a new revision"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Saves the spec, the rows it was computed against and the result, as revision 1. It reopens anywhere you are signed in."
              : frozenRevisionNo != null
                ? `Revision ${frozenRevisionNo} is frozen, so this forks a new revision beside it. The frozen one is not changed.`
                : "Revisions are append-only: this adds one, and every earlier revision stays exactly as it was."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "create" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="save-analysis-name">Name</Label>
                <Input id="save-analysis-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="save-analysis-project">Project (optional)</Label>
                <NativeSelect
                  id="save-analysis-project"
                  value={projectId}
                  onChange={(v) => {
                    setProjectId(v)
                    setExperimentId("")
                  }}
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="save-analysis-experiment">Experiment (optional)</Label>
                <NativeSelect id="save-analysis-experiment" value={experimentId} onChange={setExperimentId}>
                  <option value="">Not filed under an experiment</option>
                  {experimentOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">
                  Filed analyses show on the experiment and its project. Unfiled ones stay in your own library.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="save-analysis-summary">What changed (optional)</Label>
              <Input
                id="save-analysis-summary"
                value={changeSummary}
                placeholder="e.g. Excluded well B7, switched to Welch's t-test"
                onChange={(e) => setChangeSummary(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                History reads better as a list of what changed than a list of timestamps.
              </p>
            </div>
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: name.trim() || "Untitled analysis",
                experimentId: experimentId || null,
                changeSummary: changeSummary.trim(),
              })
            }
            disabled={saving}
          >
            {saving ? (
              <>
                <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : mode === "create" ? (
              "Save analysis"
            ) : (
              "Save revision"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The history (§3A.4).
 *
 * Every revision is here forever, and each row says what changed rather than
 * when. Three actions, and each one is a rule:
 *
 *   Open / Restore  goes through the integrity check, never a silent recompute;
 *   Freeze          one-way, and absent once it has happened;
 *   Export          the analysis can leave, under a documented open schema.
 *
 * There is deliberately no delete. An append-only table with a delete button on
 * top of it is not append-only.
 */
export function RevisionHistoryDialog({
  open,
  onOpenChange,
  analysis,
  revisions,
  recent,
  loading,
  openRevisionId,
  busyRevisionId,
  onSelectAnalysis,
  onOpenRevision,
  onFreeze,
  onExport,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  analysis: SavedAnalysis | null
  revisions: AnalysisRevision[]
  /** Offered when nothing is open yet, so saved work is reachable from here. */
  recent: SavedAnalysis[]
  loading: boolean
  openRevisionId: string | null
  busyRevisionId: string | null
  onSelectAnalysis: (analysis: SavedAnalysis) => void
  /** `restore` writes the revision back over the working draft as well. */
  onOpenRevision: (revision: AnalysisRevision, restore: boolean) => void
  onFreeze: (revision: AnalysisRevision) => void
  onExport: (revision: AnalysisRevision) => void
}) {
  const latestNo = revisions[0]?.revisionNo ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowCounterClockwise className="h-4 w-4 text-[var(--n9-accent,#965034)]" />
            {analysis?.name ?? "Saved analyses"}
          </DialogTitle>
          <DialogDescription>
            {analysis
              ? "Every revision of this analysis, newest first. Opening one loads the result it stored — it is never recomputed behind your back."
              : "Pick one to open. Nothing on this page is saved to the server until you save it."}
          </DialogDescription>
        </DialogHeader>

        {!analysis && (
          <div className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
            {loading && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                <CircleNotch className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…
              </p>
            )}
            {!loading && recent.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                You have no saved analyses yet. Save this one to keep it without downloading a file.
              </p>
            )}
            {recent.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelectAnalysis(a)}
                className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {a.currentRevisionNo > 0 ? `r${a.currentRevisionNo}` : "draft"}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className={cn("max-h-[26rem] space-y-2 overflow-y-auto pr-1", !analysis && "hidden")}>
          {loading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <CircleNotch className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading history…
            </p>
          )}

          {!loading && revisions.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No revisions yet. Save the analysis to cut revision 1.
            </p>
          )}

          {revisions.map((rev) => {
            const isOpen = rev.id === openRevisionId
            const busy = rev.id === busyRevisionId
            return (
              <div
                key={rev.id}
                className={cn(
                  "rounded-xl border px-3.5 py-3",
                  isOpen ? "border-[var(--n9-accent,#965034)]/45 bg-[var(--n9-accent,#965034)]/[0.06]" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground/80">
                    r{rev.revisionNo}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {rev.name || rev.changeSummary || "Saved revision"}
                  </span>
                  {rev.isFrozen && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/[0.09] px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      <Lock className="h-3 w-3" weight="fill" /> Frozen
                    </span>
                  )}
                  {isOpen && <span className="text-[11px] font-medium text-[var(--n9-accent,#965034)]">Open</span>}
                </div>

                <p className="mt-1 text-[12px] text-muted-foreground">
                  {new Date(rev.createdAt).toLocaleString()} · {rev.engineVersion}
                  {rev.forkedFromRevisionId && " · forked"}
                </p>
                {rev.name && rev.changeSummary && (
                  <p className="mt-1 text-[12.5px] text-foreground/80">{rev.changeSummary}</p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={isOpen ? "outline" : "default"}
                    disabled={busy || isOpen}
                    onClick={() => onOpenRevision(rev, rev.revisionNo !== latestNo)}
                  >
                    {busy ? (
                      <>
                        <CircleNotch className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Opening…
                      </>
                    ) : rev.revisionNo === latestNo ? (
                      "Open"
                    ) : (
                      "Restore"
                    )}
                  </Button>
                  {!rev.isFrozen && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => onFreeze(rev)}>
                      <LockOpen className="mr-1.5 h-3.5 w-3.5" /> Freeze
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onExport(rev)}>
                    <DownloadSimple className="mr-1.5 h-3.5 w-3.5" /> Export
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
