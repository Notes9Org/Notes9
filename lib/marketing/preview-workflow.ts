/** Marketing home interactive preview — 15-step connected research loop. */

import { previewNotePlainTextLength } from "@/lib/marketing/preview-note-content"

export const PREVIEW_STEP_COUNT = 15

export const STEP_HINTS: Record<number, string> = {
  1: "Acknowledge the intro, then use the left sidebar to move around.",
  2: "Open Dashboard to see a snapshot of active work.",
  3: "Go to Projects and scan the list.",
  4: "Open the sample project to see objective and context.",
  5: "Switch to Experiments for that project.",
  6: "Open the active experiment to see execution context.",
  7: "Expand the linked protocol to see versioned steps.",
  8: "Open Samples to see material IDs tied to the experiment.",
  9: "Open Lab Notes and focus the editor.",
  10: "Type a short observation in the note (sample data only in this preview).",
  11: "Use a format control (bold or bullet) in the note.",
  12: "Ask the preview assistant using an allowed action chip.",
  13: "Run a literature search in the preview.",
  14: "Stage a paper to the project, then open the research map view.",
  15: "Return to Dashboard and use Create account when you are ready for real data.",
}

export type PreviewRouteId =
  | "dashboard"
  | "projects"
  | "project"
  | "experiments"
  | "experiment"
  | "samples"
  | "lab-notes"
  | "protocols"
  | "literature"
  | "research-map"
  | "writing"
  | "equipment"
  | "reports"

export type PreviewSessionFlags = {
  introAcknowledged: boolean
  route: PreviewRouteId
  /** Latched: user reached Dashboard after intro (stays true if they navigate away). */
  everDashboard: boolean
  everProjects: boolean
  projectOpened: boolean
  experimentsFromProject: boolean
  experimentOpened: boolean
  protocolExpanded: boolean
  samplesVisited: boolean
  labNotesVisited: boolean
  noteTitle: string
  noteBody: string
  noteHasFormattedLine: boolean
  aiRepliesCount: number
  literatureSearched: boolean
  paperStaged: boolean
  mapVisited: boolean
  /** Latched: user returned to Dashboard after completing the map + stage flow (step 14). */
  returnedToDashboard: boolean
}

export function createInitialSessionFlags(): PreviewSessionFlags {
  return {
    introAcknowledged: false,
    route: "dashboard",
    everDashboard: false,
    everProjects: false,
    projectOpened: false,
    experimentsFromProject: false,
    experimentOpened: false,
    protocolExpanded: false,
    samplesVisited: false,
    labNotesVisited: false,
    noteTitle: "Bench observation — Dose run #3",
    noteBody: "",
    noteHasFormattedLine: false,
    aiRepliesCount: 0,
    literatureSearched: false,
    paperStaged: false,
    mapVisited: false,
    returnedToDashboard: false,
  }
}

function stepDone(step: number, s: PreviewSessionFlags): boolean {
  switch (step) {
    case 1:
      return s.introAcknowledged
    case 2:
      return s.introAcknowledged && s.everDashboard
    case 3:
      return s.everProjects
    case 4:
      return s.projectOpened
    case 5:
      return s.experimentsFromProject || s.route === "experiments"
    case 6:
      return s.experimentOpened
    case 7:
      return s.protocolExpanded
    case 8:
      return s.samplesVisited
    case 9:
      return s.labNotesVisited
    case 10:
      return previewNotePlainTextLength(s.noteBody) >= 20
    case 11:
      return s.noteHasFormattedLine
    case 12:
      return s.aiRepliesCount >= 1
    case 13:
      return s.literatureSearched
    case 14:
      return s.paperStaged && s.mapVisited
    case 15:
      return s.returnedToDashboard && s.everDashboard
    default:
      return false
  }
}

export function completedStepsMask(s: PreviewSessionFlags): boolean[] {
  return Array.from({ length: PREVIEW_STEP_COUNT }, (_, i) => stepDone(i + 1, s))
}

export function firstIncompleteStep(s: PreviewSessionFlags): number {
  for (let i = 1; i <= PREVIEW_STEP_COUNT; i++) {
    if (!stepDone(i, s)) return i
  }
  return PREVIEW_STEP_COUNT
}
