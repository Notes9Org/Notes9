/**
 * lib/onboarding/checklist.ts
 *
 * The Getting Started checklist model, shared by the dashboard server component
 * (which measures the signals) and the client panel (which renders them).
 *
 * Completion is **derived from real workspace rows**, not stored, so the
 * checklist can never disagree with what the user has actually built, and it
 * keeps working for someone who did the thing before ever seeing the checklist.
 * The only persisted state is what cannot be derived: manual "Mark as done"
 * overrides and whether the panel was dismissed (`profiles.onboarding_checklist`).
 */

export type ChecklistTaskId =
  | "personalise"
  | "create_project"
  | "literature_search"
  | "ask_catalyst"
  | "chart_data"

export type ChecklistTask = {
  id: ChecklistTaskId
  title: string
  description: string
  /** Label for the primary action. */
  cta: string
  /** Route the action navigates to, or null when the action is handled in-app. */
  href: string | null
  /** True when the task cannot be manually dismissed (it completes on its own). */
  autoOnly?: boolean
}

export const CHECKLIST_TASKS: ChecklistTask[] = [
  {
    id: "personalise",
    title: "Personalise your lab",
    description: "Tell Notes9 your field so starter content and Catalyst match your work.",
    cta: "Done",
    href: null,
    autoOnly: true,
  },
  {
    id: "create_project",
    title: "Create your first project",
    description: "Projects hold your experiments, notes, protocols and literature together.",
    cta: "New project",
    href: "/projects/new",
  },
  {
    id: "literature_search",
    title: "Run a literature search",
    description: "Ask a research question and save the papers that matter to your library.",
    cta: "Search literature",
    href: "/literature-reviews",
  },
  {
    id: "ask_catalyst",
    title: "Ask Catalyst about your work",
    description: "Catalyst answers from your projects and notes, with citations you can check.",
    cta: "Open Catalyst",
    href: "/catalyst",
  },
  {
    id: "chart_data",
    title: "Bring your data in",
    description: "Upload spreadsheets, images and raw output to an experiment and find them all in one place.",
    cta: "Open Data files",
    href: "/data",
  },
]

/** Raw counts measured against the workspace, used to derive completion. */
export type ChecklistSignals = {
  welcomeSeen: boolean
  /** Projects the user made themselves, seeded demo projects are excluded. */
  ownProjectCount: number
  /** Saved literature outside the seeded demo project. */
  savedLiteratureCount: number
  catalystMessageCount: number
  dataFileCount: number
}

/** Persisted state from `profiles.onboarding_checklist`. */
export type ChecklistState = {
  done: ChecklistTaskId[]
  dismissed: boolean
}

const TASK_IDS = new Set<string>(CHECKLIST_TASKS.map((t) => t.id))

/** Tolerant parse, the column is free-form jsonb and may predate any given shape. */
export function parseChecklistState(raw: unknown): ChecklistState {
  const obj = (raw ?? {}) as Record<string, unknown>
  const done = Array.isArray(obj.done)
    ? (obj.done.filter((id): id is ChecklistTaskId => typeof id === "string" && TASK_IDS.has(id)))
    : []
  return { done, dismissed: obj.dismissed === true }
}

export type ResolvedTask = ChecklistTask & {
  completed: boolean
  /** True when completion came from "Mark as done" rather than a real signal. */
  manuallyCompleted: boolean
}

export type ResolvedChecklist = {
  tasks: ResolvedTask[]
  completedCount: number
  totalCount: number
  /** 0–100, for the progress meter. */
  percent: number
  allComplete: boolean
}

function isSignalComplete(id: ChecklistTaskId, s: ChecklistSignals): boolean {
  switch (id) {
    case "personalise":
      return s.welcomeSeen
    case "create_project":
      return s.ownProjectCount > 0
    case "literature_search":
      return s.savedLiteratureCount > 0
    case "ask_catalyst":
      return s.catalystMessageCount > 0
    case "chart_data":
      return s.dataFileCount > 0
  }
}

/** Maps the wizard's goal options onto the task each one implies. */
const GOAL_TO_TASK: Record<string, ChecklistTaskId> = {
  "Organize my research": "create_project",
  "Review the literature": "literature_search",
  "Analyse my data": "chart_data",
  "Write up results & papers": "create_project",
}

/**
 * Orders the list so it reads as advice rather than a fixed form:
 *
 *  1. Creating a project, if still outstanding, nothing else works without one.
 *  2. Whatever the user said they came here to do, in the order they said it.
 *  3. Everything else still outstanding.
 *  4. Completed tasks, which sink to the bottom.
 *
 * `primaryGoal` is the comma-separated multi-select the wizard writes.
 */
export function prioritiseForGoals(
  tasks: ResolvedTask[],
  primaryGoal?: string | null
): ResolvedTask[] {
  const goalOrder = (primaryGoal ?? "")
    .split(",")
    .map((g) => GOAL_TO_TASK[g.trim()])
    .filter(Boolean) as ChecklistTaskId[]

  const rank = (task: ResolvedTask): number => {
    if (task.completed) return 300
    if (task.id === "create_project") return 0
    const goalIndex = goalOrder.indexOf(task.id)
    if (goalIndex >= 0) return 100 + goalIndex
    return 200
  }

  return [...tasks].sort((a, b) => rank(a) - rank(b))
}

export function resolveChecklist(
  signals: ChecklistSignals,
  state: ChecklistState
): ResolvedChecklist {
  const tasks = CHECKLIST_TASKS.map((task) => {
    const bySignal = isSignalComplete(task.id, signals)
    const byOverride = state.done.includes(task.id)
    return {
      ...task,
      completed: bySignal || byOverride,
      manuallyCompleted: !bySignal && byOverride,
    }
  })

  const completedCount = tasks.filter((t) => t.completed).length
  return {
    tasks,
    completedCount,
    totalCount: tasks.length,
    percent: Math.round((completedCount / tasks.length) * 100),
    allComplete: completedCount === tasks.length,
  }
}
