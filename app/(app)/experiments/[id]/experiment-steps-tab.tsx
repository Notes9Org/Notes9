"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Clock,
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  SkipForward,
  ArrowDown,
  FlaskConical,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getSteps,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps,
  type ExperimentStep,
  type StepCategory,
  type StepStatus,
} from "@/lib/experiment-steps"
import { AddStepDialog } from "./add-step-dialog"

interface ExperimentStepsTabProps {
  experimentId: string
}

// Status colors map to semantic tokens (--info / --primary / --destructive /
// --warning) so theme changes ripple through without per-status overrides.
const STATUS_CONFIG: Record<StepStatus, { label: string; icon: typeof Circle; color: string; bg: string }> = {
  pending: { label: "Pending", icon: Circle, color: "text-muted-foreground", bg: "bg-muted" },
  in_progress: { label: "In Progress", icon: Loader2, color: "text-[var(--color-info)]", bg: "bg-[var(--color-info)]/10" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-[var(--color-success)]", bg: "bg-[var(--color-success)]/10" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10" },
  skipped: { label: "Skipped", icon: SkipForward, color: "text-[var(--color-warning)]", bg: "bg-[var(--color-warning)]/10" },
}

const CATEGORY_COLORS: Record<StepCategory, string> = {
  "Sample Handling": "border-l-orange-400",
  "Reaction / Treatment": "border-l-red-400",
  "Separation / Purification": "border-l-purple-400",
  "Measurement / Analysis": "border-l-blue-400",
  "Computational": "border-l-cyan-400",
  "Quality / Control": "border-l-green-400",
  "Decision / Workflow": "border-l-yellow-400",
  "Documentation": "border-l-gray-400",
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return ""
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

type StepDraft = Omit<ExperimentStep, "id" | "experiment_id" | "order" | "created_at" | "updated_at">

export function ExperimentStepsTab({ experimentId }: ExperimentStepsTabProps) {
  const [steps, setSteps] = useState<ExperimentStep[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStep, setEditingStep] = useState<ExperimentStep | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    const list = await getSteps(experimentId)
    setSteps(list)
    setIsLoading(false)
  }, [experimentId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleAddStep = useCallback(async (stepData: StepDraft) => {
    await addStep(experimentId, stepData)
    await refresh()
    setEditingStep(null)
  }, [experimentId, refresh])

  const handleEditStep = useCallback(async (stepData: StepDraft) => {
    if (!editingStep) return
    await updateStep(experimentId, editingStep.id, stepData)
    await refresh()
    setEditingStep(null)
  }, [experimentId, editingStep, refresh])

  const handleDelete = useCallback(async (stepId: string) => {
    await deleteStep(experimentId, stepId)
    await refresh()
  }, [experimentId, refresh])

  const handleMove = useCallback(async (stepId: string, direction: "up" | "down") => {
    const idx = steps.findIndex((s) => s.id === stepId)
    if (idx < 0) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= steps.length) return
    const ids = steps.map((s) => s.id)
    ;[ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]]
    await reorderSteps(experimentId, ids)
    await refresh()
  }, [steps, experimentId, refresh])

  const handleStatusChange = useCallback(async (stepId: string, status: StepStatus) => {
    await updateStep(experimentId, stepId, { status })
    await refresh()
  }, [experimentId, refresh])

  const completedCount = steps.filter((s) => s.status === "completed").length
  const totalDuration = steps.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Experiment Steps</h3>
          <p className="text-sm text-muted-foreground">
            {steps.length > 0
              ? `${completedCount}/${steps.length} completed${totalDuration > 0 ? ` · ${formatDuration(totalDuration)} total` : ""}`
              : "Design your experiment as a sequence of steps"}
          </p>
        </div>
        <Button onClick={() => { setEditingStep(null); setDialogOpen(true) }} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Step
        </Button>
      </div>

      {/* Progress bar */}
      {steps.length > 0 && (
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      )}

      {/* Steps pipeline */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : steps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FlaskConical className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No steps yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add steps to design your experiment workflow
            </p>
            <Button onClick={() => { setEditingStep(null); setDialogOpen(true) }} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add First Step
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="h-10 px-4 font-medium text-muted-foreground w-16">Step</th>
                <th className="h-10 px-4 font-medium text-muted-foreground">Title</th>
                <th className="h-10 px-4 font-medium text-muted-foreground">Type</th>
                <th className="h-10 px-4 font-medium text-muted-foreground">Category</th>
                <th className="h-10 px-4 font-medium text-muted-foreground">Duration</th>
                <th className="h-10 px-4 font-medium text-muted-foreground">Status</th>
                <th className="h-10 px-4 font-medium text-muted-foreground text-right w-[150px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, index) => {
                const statusCfg = STATUS_CONFIG[step.status]
                const StatusIcon = statusCfg.icon
                const isLast = index === steps.length - 1

                return (
                  <tr key={step.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
                    <td className="p-4 align-middle">
                      <div className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold",
                        statusCfg.bg, statusCfg.color
                      )}>
                        {step.status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          step.order
                        )}
                      </div>
                    </td>
                    <td className="p-4 align-middle">
                      <div className="font-medium">{step.title}</div>
                      {step.description && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {step.description}
                        </div>
                      )}
                    </td>
                    <td className="p-4 align-middle">
                      <Badge variant="outline" className="text-2xs px-1.5 py-0 font-normal">
                        {step.step_type}
                      </Badge>
                    </td>
                    <td className="p-4 align-middle">
                      <span className="text-xs text-muted-foreground">{step.category}</span>
                    </td>
                    <td className="p-4 align-middle">
                      {step.duration_minutes ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(step.duration_minutes)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-4 align-middle">
                      <Badge variant="outline" className={cn("text-2xs px-1.5 py-0 font-normal", statusCfg.color)}>
                        <StatusIcon className={cn("h-3 w-3 mr-1", step.status === "in_progress" && "animate-spin")} />
                        {statusCfg.label}
                      </Badge>
                    </td>
                    <td className="p-4 align-middle text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={index === 0}
                          onClick={() => handleMove(step.id, "up")}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={isLast}
                          onClick={() => handleMove(step.id, "down")}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingStep(step); setDialogOpen(true) }}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            {step.status !== "completed" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(step.id, "completed")}>
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Completed
                              </DropdownMenuItem>
                            )}
                            {step.status !== "in_progress" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(step.id, "in_progress")}>
                                <Loader2 className="h-4 w-4 mr-2" /> Mark In Progress
                              </DropdownMenuItem>
                            )}
                            {step.status !== "failed" && (
                              <DropdownMenuItem onClick={() => handleStatusChange(step.id, "failed")}>
                                <AlertCircle className="h-4 w-4 mr-2" /> Mark Failed
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(step.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add step dialog */}
      <AddStepDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={editingStep ? handleEditStep : handleAddStep}
        editingStep={editingStep}
      />
    </div>
  )
}
