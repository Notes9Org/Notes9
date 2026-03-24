export const IS_STEPS_MOCKED = true

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

// In-memory store keyed by experiment_id
const stepsStore = new Map<string, ExperimentStep[]>()

// Seed some demo data
stepsStore.set("demo", [
  {
    id: "step-1",
    experiment_id: "demo",
    order: 1,
    title: "Prepare serum samples",
    category: "Sample Handling",
    step_type: "Sample Preparation",
    description: "Thaw frozen serum aliquots and dilute 1:100 in coating buffer",
    duration_minutes: 30,
    status: "completed",
    notes: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "step-2",
    experiment_id: "demo",
    order: 2,
    title: "Coat ELISA plates",
    category: "Reaction / Treatment",
    step_type: "Incubation",
    description: "Add 100µL antigen per well, incubate overnight at 4°C",
    duration_minutes: 720,
    status: "completed",
    notes: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "step-3",
    experiment_id: "demo",
    order: 3,
    title: "Run ELISA assay",
    category: "Measurement / Analysis",
    step_type: "ELISA",
    description: "Wash, block, add primary/secondary antibodies, develop with TMB",
    duration_minutes: 180,
    status: "in_progress",
    notes: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "step-4",
    experiment_id: "demo",
    order: 4,
    title: "Analyze OD readings",
    category: "Computational",
    step_type: "Data Analysis",
    description: "Plot standard curve, calculate antibody titers",
    duration_minutes: 60,
    status: "pending",
    notes: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
])

export function getSteps(experimentId: string): ExperimentStep[] {
  return [...(stepsStore.get(experimentId) || [])].sort((a, b) => a.order - b.order)
}

export function addStep(
  experimentId: string,
  step: Omit<ExperimentStep, "id" | "experiment_id" | "order" | "created_at" | "updated_at">
): ExperimentStep {
  const existing = stepsStore.get(experimentId) || []
  const newStep: ExperimentStep = {
    ...step,
    id: `step-${Date.now()}`,
    experiment_id: experimentId,
    order: existing.length + 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  stepsStore.set(experimentId, [...existing, newStep])
  return newStep
}

export function updateStep(experimentId: string, stepId: string, updates: Partial<ExperimentStep>) {
  const existing = stepsStore.get(experimentId) || []
  stepsStore.set(
    experimentId,
    existing.map((s) => (s.id === stepId ? { ...s, ...updates, updated_at: new Date().toISOString() } : s))
  )
}

export function deleteStep(experimentId: string, stepId: string) {
  const existing = stepsStore.get(experimentId) || []
  const filtered = existing.filter((s) => s.id !== stepId)
  // Re-order
  filtered.forEach((s, i) => { s.order = i + 1 })
  stepsStore.set(experimentId, filtered)
}

export function reorderSteps(experimentId: string, orderedIds: string[]) {
  const existing = stepsStore.get(experimentId) || []
  const reordered = orderedIds
    .map((id, i) => {
      const step = existing.find((s) => s.id === id)
      return step ? { ...step, order: i + 1 } : null
    })
    .filter(Boolean) as ExperimentStep[]
  stepsStore.set(experimentId, reordered)
}
