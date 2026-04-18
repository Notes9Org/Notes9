"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { createClient } from "@/lib/supabase/client"
import type { ReportGenerationRequest } from "@/lib/report-agent-types"

// ---------------------------------------------------------------------------
// useReportGeneration hook
// ---------------------------------------------------------------------------

interface ReportGenerationState {
  content: string | null
  error: string | null
  isGenerating: boolean
}

interface UseReportGenerationReturn extends ReportGenerationState {
  generate: (
    request: ReportGenerationRequest,
    token: string,
  ) => Promise<{ content: string | null; error: string | null }>
  reset: () => void
}

const INITIAL_STATE: ReportGenerationState = {
  content: null,
  error: null,
  isGenerating: false,
}

export function useReportGeneration(): UseReportGenerationReturn {
  const [state, setState] = useState<ReportGenerationState>(INITIAL_STATE)

  const generate = useCallback(
    async (
      request: ReportGenerationRequest,
      token: string,
    ): Promise<{ content: string | null; error: string | null }> => {
      setState({ content: null, error: null, isGenerating: true })

      try {
        const res = await fetch("/api/reports/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: request.query,
            projectName: request.projectName,
            experimentNames: request.experimentNames,
            experimentData: request.experimentData,
          }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const msg = body.error || `Request failed with status ${res.status}`
          setState({ content: null, error: msg, isGenerating: false })
          return { content: null, error: msg }
        }

        const data = await res.json()
        const content = data.content as string
        setState({ content, error: null, isGenerating: false })
        return { content, error: null }
      } catch (err: any) {
        const msg = err.message || "Failed to generate report"
        setState({ content: null, error: msg, isGenerating: false })
        return { content: null, error: msg }
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return { ...state, generate, reset }
}

// ---------------------------------------------------------------------------
// ReportGeneratorDialog component
// ---------------------------------------------------------------------------

interface ReportGeneratorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: { id: string; name: string }[]
  experiments: { id: string; name: string; project_id: string }[]
  userId: string
}

function extractTitle(content: string): string {
  const match = content.match(/^#{1,3}\s+(.+)/m)
  return match ? match[1].trim() : "Data Analysis Report"
}

export function ReportGeneratorDialog({
  open,
  onOpenChange,
  projects,
  experiments,
  userId,
}: ReportGeneratorDialogProps) {
  const router = useRouter()
  const { isGenerating, content, error, generate, reset } =
    useReportGeneration()

  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<string[]>(
    [],
  )
  const [query, setQuery] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const filteredExperiments = useMemo(
    () =>
      selectedProjectId
        ? experiments.filter((e) => e.project_id === selectedProjectId)
        : [],
    [experiments, selectedProjectId],
  )

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  )

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value)
    setSelectedExperimentIds([])
  }

  const toggleExperiment = (id: string) => {
    setSelectedExperimentIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    )
  }

  const supabase = createClient()

  const handleGenerate = async () => {
    if (!selectedProject || !query.trim()) return
    setSaveError(null)

    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setSaveError("You must be signed in to generate a report.")
      return
    }

    const experimentNames = selectedExperimentIds
      .map((id) => experiments.find((e) => e.id === id)?.name)
      .filter(Boolean) as string[]

    // Fetch actual experiment data (xlsx/csv) to include in the AI prompt
    let experimentData = ""
    try {
      const dataRes = await fetch("/api/reports/experiment-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          experimentIds:
            selectedExperimentIds.length > 0 ? selectedExperimentIds : undefined,
        }),
      })
      if (dataRes.ok) {
        const { tabularData, otherFiles, labNotesData } = await dataRes.json()
        const parts: string[] = []
        for (const td of tabularData ?? []) {
          parts.push(`--- FILE: ${td.fileName} (${td.dataType}) ---\n${td.csv}`)
        }
        if (otherFiles?.length) {
          parts.push(
            `--- OTHER FILES ---\n${(otherFiles as Array<{ fileName: string; fileType: string; dataType: string }>).map((f) => `${f.fileName} (${f.fileType}, ${f.dataType})`).join("\n")}`,
          )
        }
        for (const note of labNotesData ?? []) {
          parts.push(`--- LAB NOTE: ${note.title}${note.noteType ? ` (${note.noteType})` : ""} ---\n${note.content}`)
        }
        experimentData = parts.join("\n\n")
      }
    } catch {
      // Non-fatal: proceed without data context
    }

    const request: ReportGenerationRequest = {
      query: query.trim(),
      projectId: selectedProjectId,
      projectName: selectedProject.name,
      experimentIds:
        selectedExperimentIds.length > 0 ? selectedExperimentIds : undefined,
      experimentNames: experimentNames.length > 0 ? experimentNames : undefined,
      experimentData: experimentData || undefined,
    }

    const result = await generate(request, token)

    if (result.content) {
      await saveReport(result.content)
    }
  }

  const saveReport = async (reportContent: string) => {
    setIsSaving(true)
    setSaveError(null)

    try {
      const title = extractTitle(reportContent)

      const { data, error: insertError } = await supabase
        .from("reports")
        .insert({
          title,
          content: reportContent,
          status: "draft",
          report_type: "data_analysis",
          project_id: selectedProjectId,
          experiment_id: selectedExperimentIds[0] ?? null,
          generated_by: userId,
        })
        .select("id")
        .single()

      if (insertError) {
        setSaveError(insertError.message)
        return
      }

      onOpenChange(false)
      resetForm()
      router.push(`/reports/${data.id}`)
    } catch (err: any) {
      setSaveError(err.message || "Failed to save report")
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setSelectedProjectId("")
    setSelectedExperimentIds([])
    setQuery("")
    setSaveError(null)
    reset()
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  const canSubmit =
    !!selectedProjectId && !!query.trim() && !isGenerating && !isSaving

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Data Analysis Report</DialogTitle>
          <DialogDescription>
            Select a project, optionally choose experiments, and describe the
            analysis you need.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project select */}
          <div className="space-y-2">
            <Label htmlFor="project-select">Project *</Label>
            <Select
              value={selectedProjectId}
              onValueChange={handleProjectChange}
              disabled={isGenerating}
            >
              <SelectTrigger id="project-select">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Experiment multi-select via checkboxes */}
          {filteredExperiments.length > 0 && (
            <div className="space-y-2">
              <Label>Experiments (optional)</Label>
              <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1">
                {filteredExperiments.map((exp) => (
                  <label
                    key={exp.id}
                    className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-accent text-sm"
                  >
                    <Checkbox
                      checked={selectedExperimentIds.includes(exp.id)}
                      onCheckedChange={() => toggleExperiment(exp.id)}
                      disabled={isGenerating}
                    />
                    <span className="truncate">{exp.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Query textarea */}
          <div className="space-y-2">
            <Label htmlFor="query-textarea">Analysis Query *</Label>
            <Textarea
              id="query-textarea"
              placeholder="Describe the analysis you need, e.g. 'Analyze trends in cell viability data across all experiments'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isGenerating}
              rows={4}
            />
          </div>

          {/* Loading indicator */}
          {isGenerating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating report…</span>
            </div>
          )}

          {/* Generation error */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleGenerate}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Save error (Supabase insert failed but content exists) */}
          {saveError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <p>Failed to save: {saveError}</p>
              {content && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => saveReport(content)}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving…" : "Retry Save"}
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={!canSubmit}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              "Generate Report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
