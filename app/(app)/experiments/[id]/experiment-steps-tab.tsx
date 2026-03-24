"use client"

import { useState, useCallback } from "react"
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
  IS_STEPS_MOCKED,
  getSteps,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps,
  type ExperimentStep,
  type StepCategory,
  type StepStatus,
} from "@/lib/experiment-steps-mock"
import { AddStepDialog } from "./add-step-dialog"

interface ExperimentStepsTabProps {
  experimentId: string
}

const STATUS_CONFIG: Record<StepStatus, { label: string; icon: typeof Circle; color: string; bg: string }> = {
  pending: { label: "Pending", icon: Circle, color: "text-muted-foreground", bg: "bg-muted" },
  in_progress: { label: "In Progress", icon: Loader2, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
  completed: { label: "Completed", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
  skipped: { label: "Skipped", icon: SkipForward, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
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

export function ExperimentStepsTab({ experimentId }: ExperimentStepsTabProps) {
  const [steps, setSteps] = useState<ExperimentStep[]>(() => {
    if (IS_STEPS_MOCKED) return getSteps(experimentId)
    return []
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStep, setEditingStep] = useState<ExperimentStep | null>(null)

  const refresh = useCallback(() => {
    if (IS_STEPS_MOCKED) setSteps(getSteps(experimentId))
  }, [experimentId])

  const handleAddStep = useCallback((stepData: any) => {
    if (IS_STEPS_MOCKED) {
      addStep(experimentId, stepData)
      refresh()
    }
    setEditingStep(null)
  }, [experimentId, refresh])

  const handleEditStep = useCallback((stepData: any) => {
    if (IS_STEPS_MOCKED && editingStep) {
      updateStep(experimentId, editingStep.id, stepData)
      refresh()
    }
    setEditingStep(null)
  }, [experimentId, editingStep, refresh])

  const handleDelete = useCallback((stepId: string) => {
    if (IS_STEPS_MOCKED) {
      deleteStep(experimentId, stepId)
      refresh()
    }
  }, [experimentId, refresh])

  const handleMove = useCallback((stepId: string, direction: "up" | "down") => {
    const idx = steps.findIndex((s) => s.id === stepId)
    if (idx < 0) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= steps.length) return
    const ids = steps.map((s) => s.id)
    ;[ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]]
    if (IS_STEPS_MOCKED) {
      reorderSteps(experimentId, ids)
      refresh()
    }
  }, [steps, experimentId, refresh])

  const handleStatusChange = useCallback((stepId: string, status: StepStatus) => {
    if (IS_STEPS_MOCKED) {
      updateStep(experimentId, stepId, { status })
      refresh()
    }
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
      {steps.length === 0 ? (
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
        <div className="space-y-0">
          {steps.map((step, index) => {
            const statusCfg = STATUS_CONFIG[step.status]
            const StatusIcon = statusCfg.icon
            const isLast = index === steps.length - 1

            return (
              <div key={step.id}>
                <Card className={cn(
                  "border-l-4 transition-all hover:shadow-md",
                  CATEGORY_COLORS[step.category] || "border-l-gray-400"
                )}>
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start gap-4">
                      {/* Step number + status icon */}
                      <div className="flex flex-col items-center gap-1 pt-0.5">
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
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm">{step.title}</h4>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {step.step_type}
                          </Badge>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusCfg.color)}>
                            <StatusIcon className={cn("h-3 w-3 mr-1", step.status === "in_progress" && "animate-spin")} />
                            {statusCfg.label}
                          </Badge>
                        </div>
                        {step.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{step.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[10px] text-muted-foreground">{step.category}</span>
                          {step.duration_minutes && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDuration(step.duration_minutes)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
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
                    </div>
                  </CardContent>
                </Card>

                {/* Connector arrow */}
                {!isLast && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            )
          })}
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
