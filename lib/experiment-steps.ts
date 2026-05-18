"use client"

import { createClient } from "@/lib/supabase/client"

export const STEP_CATEGORIES = [
  "Sample Handling",
  "Reaction / Treatment",
  "Separation / Purification",
  "Measurement / Analysis",
  "Computational",
  "Quality / Control",
  "Decision / Workflow",
  "Documentation",
] as const

export type StepCategory = (typeof STEP_CATEGORIES)[number]

export const STEP_TYPES: Record<StepCategory, string[]> = {
  "Sample Handling": [
    "Sample Preparation",
    "Sample Collection",
    "Storage",
    "Transfer",
    "Aliquoting",
    "Dilution",
  ],
  "Reaction / Treatment": [
    "Chemical Reaction",
    "Incubation",
    "Treatment / Exposure",
    "Transformation / Transfection",
    "Ligation",
    "Digestion",
  ],
  "Separation / Purification": [
    "Centrifugation",
    "Filtration",
    "Chromatography",
    "Extraction (DNA/RNA/Protein)",
    "Gel Electrophoresis",
    "Precipitation",
  ],
  "Measurement / Analysis": [
    "Measurement",
    "Imaging / Microscopy",
    "Spectroscopy",
    "Sequencing",
    "PCR",
    "ELISA",
    "Western Blot",
    "Flow Cytometry",
  ],
  "Computational": [
    "Data Analysis",
    "Bioinformatics",
    "Statistical Analysis",
    "Modeling / Simulation",
  ],
  "Quality / Control": [
    "Quality Check",
    "Calibration",
    "Control Step",
    "Validation",
  ],
  "Decision / Workflow": [
    "Decision Point",
    "Wait / Pause",
    "Review / Approval",
    "Repeat",
  ],
  "Documentation": [
    "Observation",
    "Photo / Image Capture",
    "Note",
  ],
}

export type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped"

export interface ExperimentStep {
  id: string
  experiment_id: string
  order: number
  title: string
  category: StepCategory
  step_type: string
  description: string
  duration_minutes: number | null
  status: StepStatus
  notes: string
  created_at: string
  updated_at: string
}

type StepInput = Omit<ExperimentStep, "id" | "experiment_id" | "order" | "created_at" | "updated_at">

const SELECT_COLS = 'id, experiment_id, "order", title, category, step_type, description, duration_minutes, status, notes, created_at, updated_at'

export async function getSteps(experimentId: string): Promise<ExperimentStep[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("experiment_steps")
    .select(SELECT_COLS)
    .eq("experiment_id", experimentId)
    .order("order", { ascending: true })
  if (error) {
    console.error("Error fetching experiment steps:", error)
    return []
  }
  return (data ?? []) as ExperimentStep[]
}

export async function addStep(experimentId: string, step: StepInput): Promise<ExperimentStep | null> {
  const supabase = createClient()
  const { data: existing } = await supabase
    .from("experiment_steps")
    .select("\"order\"")
    .eq("experiment_id", experimentId)
    .order("order", { ascending: false })
    .limit(1)
  const nextOrder = (existing?.[0]?.order ?? 0) + 1

  const { data, error } = await supabase
    .from("experiment_steps")
    .insert({
      experiment_id: experimentId,
      order: nextOrder,
      title: step.title,
      category: step.category,
      step_type: step.step_type,
      description: step.description,
      duration_minutes: step.duration_minutes,
      status: step.status,
      notes: step.notes,
    })
    .select(SELECT_COLS)
    .single()

  if (error) {
    console.error("Error inserting experiment step:", error)
    return null
  }
  return data as ExperimentStep
}

export async function updateStep(
  _experimentId: string,
  stepId: string,
  updates: Partial<Omit<ExperimentStep, "id" | "experiment_id" | "created_at" | "updated_at">>
): Promise<boolean> {
  const supabase = createClient()
  const payload: Record<string, unknown> = {}
  if (updates.title !== undefined) payload.title = updates.title
  if (updates.category !== undefined) payload.category = updates.category
  if (updates.step_type !== undefined) payload.step_type = updates.step_type
  if (updates.description !== undefined) payload.description = updates.description
  if (updates.duration_minutes !== undefined) payload.duration_minutes = updates.duration_minutes
  if (updates.status !== undefined) payload.status = updates.status
  if (updates.notes !== undefined) payload.notes = updates.notes
  if (updates.order !== undefined) payload.order = updates.order

  const { error } = await supabase.from("experiment_steps").update(payload).eq("id", stepId)
  if (error) {
    console.error("Error updating experiment step:", error)
    return false
  }
  return true
}

export async function deleteStep(experimentId: string, stepId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.from("experiment_steps").delete().eq("id", stepId)
  if (error) {
    console.error("Error deleting experiment step:", error)
    return false
  }
  // Renumber remaining steps so order is contiguous (1..n)
  const remaining = await getSteps(experimentId)
  await Promise.all(
    remaining.map((step, idx) =>
      step.order === idx + 1
        ? Promise.resolve()
        : supabase.from("experiment_steps").update({ order: idx + 1 }).eq("id", step.id)
    )
  )
  return true
}

export async function reorderSteps(_experimentId: string, orderedIds: string[]): Promise<boolean> {
  const supabase = createClient()
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("experiment_steps").update({ order: idx + 1 }).eq("id", id)
    )
  )
  return true
}
