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
