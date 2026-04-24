import { hasFormattedRichText } from "@/lib/marketing/preview-note-content"
import { type PreviewRouteId, type PreviewSessionFlags } from "@/lib/marketing/preview-workflow"

export type PreviewAction =
  | { type: "ACK_INTRO" }
  | { type: "NAVIGATE"; route: PreviewRouteId }
  | { type: "OPEN_PROJECT" }
  | { type: "OPEN_EXPERIMENT" }
  | { type: "TOGGLE_PROTOCOL" }
  | { type: "SET_NOTE"; title?: string; body?: string }
  | { type: "AI_REPLY" }
  | { type: "LITERATURE_SEARCH" }
  | { type: "STAGE_PAPER" }
  | { type: "HYDRATE"; payload: Partial<PreviewSessionFlags> }

function withNavigation(draft: PreviewSessionFlags, route: PreviewRouteId): void {
  draft.route = route
  if (route === "dashboard") {
    draft.everDashboard = true
    if (draft.paperStaged && draft.mapVisited) {
      draft.returnedToDashboard = true
    }
  }
  if (route === "projects") draft.everProjects = true
  if (route === "project") {
    draft.projectOpened = true
    draft.everProjects = true
  }
  if (route === "experiments") {
    draft.experimentsFromProject = true
    draft.projectOpened = true
  }
  if (route === "experiment") {
    draft.experimentOpened = true
    draft.experimentsFromProject = true
    draft.projectOpened = true
  }
  if (route === "samples") draft.samplesVisited = true
  if (route === "lab-notes") draft.labNotesVisited = true
  if (route === "research-map") draft.mapVisited = true
}

export function previewReducer(state: PreviewSessionFlags, action: PreviewAction): PreviewSessionFlags {
  const next: PreviewSessionFlags = { ...state }

  switch (action.type) {
    case "HYDRATE":
      return { ...state, ...action.payload }
    case "ACK_INTRO": {
      next.introAcknowledged = true
      if (next.route === "dashboard") next.everDashboard = true
      return next
    }
    case "NAVIGATE": {
      withNavigation(next, action.route)
      return next
    }
    case "OPEN_PROJECT": {
      withNavigation(next, "project")
      return next
    }
    case "OPEN_EXPERIMENT": {
      withNavigation(next, "experiment")
      return next
    }
    case "TOGGLE_PROTOCOL": {
      next.protocolExpanded = !next.protocolExpanded
      next.experimentOpened = true
      next.route = "experiment"
      return next
    }
    case "SET_NOTE": {
      if (action.title !== undefined) next.noteTitle = action.title
      if (action.body !== undefined) {
        next.noteBody = action.body
        if (hasFormattedRichText(action.body)) {
          next.noteHasFormattedLine = true
        }
      }
      return next
    }
    case "AI_REPLY": {
      next.aiRepliesCount = state.aiRepliesCount + 1
      next.route = "lab-notes"
      next.labNotesVisited = true
      return next
    }
    case "LITERATURE_SEARCH": {
      next.literatureSearched = true
      return next
    }
    case "STAGE_PAPER": {
      next.paperStaged = true
      return next
    }
    default:
      return state
  }
}
