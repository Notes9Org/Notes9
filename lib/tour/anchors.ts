/**
 * Single source of truth for product-tour anchors.
 *
 * The tour targets elements by `data-tour="<key>"` rather than `id` because the
 * same chrome (sidebar nav, search) renders twice — once in the desktop sidebar
 * and once inside the mobile Sheet — and duplicate ids are invalid. `data-tour`
 * can legitimately repeat; the tour engine resolves the first *visible* match.
 *
 * Keep every key referenced by a step (lib/tour/onboarding-steps,
 * lib/tour/contextual-steps) in this map so JSX and step definitions never drift.
 */
export const TOUR = {
  sidebarNav: "nav",
  sidebarSearch: "search",
  createNew: "create-new",
  navDashboard: "nav-dashboard",
  navProjects: "nav-projects",
  navLiterature: "nav-literature",
  navCatalyst: "nav-catalyst",
  navResearchMap: "nav-research-map",
  help: "help",
  themeToggle: "theme-toggle",
  aiToggle: "ai-toggle",
  createProject: "create-project",
  createExperiment: "create-experiment",
  // Page-level primary actions (list-page "New X" buttons + shared controls).
  // Each lives on a single route, so contextual tours can highlight the exact
  // button a user sees on that page. Missing anchors are skipped by the engine.
  createLabNote: "create-lab-note",
  createProtocol: "create-protocol",
  createSample: "create-sample",
  createEquipment: "create-equipment",
  addLiterature: "add-literature",
  createPaper: "create-paper",
  generateReport: "generate-report",
  viewMode: "view-mode",
  // Dashboard widgets — each is spotlighted on the dashboard help tour.
  dashSchedule: "dash-schedule",
  dashRecentWork: "dash-recent-work",
  dashWhiteboard: "dash-whiteboard",
  dashRecentlyEdited: "dash-recently-edited",
  dashMyLab: "dash-my-lab",
  // Literature feature anchors.
  litTabs: "lit-tabs",
  uploadPdf: "upload-pdf",
  // Shared list-page filter row (Projects, Experiments, Lab notes, Protocols,
  // Samples, Equipment, Reports all render it — one anchor covers them all).
  resourceFilters: "resource-filters",
  // Page-specific feature anchors.
  sampleStats: "sample-stats",
  equipmentStats: "equipment-stats",
  settingsTabs: "settings-tabs",
  mapControls: "map-controls",
  // Experiment detail page: the tab bar + the Data & Files tab controls. The
  // individual tab triggers/panels are targeted by their existing ids
  // (#tab-trigger-<value> / #tab-content-<value>).
  experimentTabs: "experiment-tabs",
  dataFiles: "data-files",
  dataActions: "data-actions",
  // Shared TipTap editor (lab notes + protocol editor).
  editorToolbar: "editor-toolbar",
  editorCalculator: "editor-calculator",
  editorCite: "editor-cite",
  editorBibliography: "editor-bibliography",
  editorContent: "editor-content",
  // Versioning + save controls shared by the lab-notes and protocol editors.
  versionHistory: "version-history",
  acceptSave: "accept-save",
  // Sample detail page: tab bar, quick-info header, actions, molecular viewer.
  sampleTabs: "sample-tabs",
  sampleQuickInfo: "sample-quickinfo",
  sampleActions: "sample-actions",
  molecularUpload: "molecular-upload",
  molecularViewer: "molecular-viewer",
  // Writing (papers) editor: title, import/export, status menu.
  paperTitle: "paper-title",
  paperImport: "paper-import",
  paperExport: "paper-export",
  paperStatus: "paper-status",
} as const

export type TourKey = (typeof TOUR)[keyof typeof TOUR]

/** CSS selector for a tour anchor key. */
export function tourSel(key: TourKey): string {
  return `[data-tour="${key}"]`
}

/** Maps a primary-nav href to its stable nav anchor key (route-stable even when
 * the sidebar rewrites hrefs with a project scope). Returns undefined for hrefs
 * that are not part of the tour. */
export function navTourKey(href: string): TourKey | undefined {
  switch (href) {
    case "/dashboard":
      return TOUR.navDashboard
    case "/projects":
      return TOUR.navProjects
    case "/literature-reviews":
      return TOUR.navLiterature
    case "/catalyst":
      return TOUR.navCatalyst
    case "/research-map":
      return TOUR.navResearchMap
    default:
      return undefined
  }
}
